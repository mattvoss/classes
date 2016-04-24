/* eslint-disable no-console */
const env = process.env.NODE_ENV || 'development';

import fs from 'fs';
import path from 'path';
import async from 'async';
import nconf from 'nconf';
import etag from 'etag';
import loki from 'lokijs';
import Cron from 'cron';


// Hapi server imports
import Hapi from 'hapi';
import Inert from 'inert';
import h2o2 from 'h2o2';
import vision from 'vision';
import hapiRouter from 'hapi-router';
import cookieJwt from 'hapi-auth-cookie-jwt';

// React imports
import React from "react";
import ReactDOM from "react-dom/server";
import { RouterContext, match } from 'react-router';
import Provider from './components/Provider';
import reactCookie from 'react-cookie';

// React-router routes and history imports
import Classes from '../src/stores/classes';
import Settings from '../src/stores/settings';
import createRoutes from '../src/routes';
import models from '../src/models';
import * as types from '../src/constants';
import api from '../src/lib/server';
import utils from '../src/lib/utils';
import parseCookies from '../src/lib/parseCookies';
import createLocation from 'history/lib/createLocation';
import createHistory from 'history/lib/createMemoryHistory';
import {createClient} from './lib/redisClient';
import { NotAuthorizedException, AccessDeniedException, RedirectException } from './lib/errors';

let subClient,
    cert = fs.readFileSync(path.join(__dirname, '../private.pem'));
const CronJob = Cron.CronJob,
      pushResults = function(message, result) {
        let update = {
          type: message.type,
          collection: message.collection,
          record: result
        }
        utils.pushMessage("changes."+message.type, update);
      },
      setSubscription = function() {
        subClient.psubscribe("congregate:*");
        //console.log("Subscribing");
        subClient.on("pmessage", function (pattern, channel, message) {
          let subChannel = channel.split(":")[1];
          //console.log("channel ", channel, ": ", message);
          if (subChannel === "insert" || subChannel === "update" || subChannel === "delete"){
            message = JSON.parse(message);
            let record =  message.target;
            delete record.meta;
            delete record.$loki;
            switch (message.type) {
              case "insert":
                api[message.collection].insert(record)
                .then(
                  function(results) {
                    pushResults(message, results);
                  },
                  function(err) {
                    console.log(err);
                  }
                );
                break;
              case "update":
                api[message.collection].update(record)
                .then(
                  function(results) {
                    pushResults(message, results);
                  },
                  function(err) {
                    console.log(err);
                  }
                );
                break;
              case "delete":
                api[message.collection].delete(record)
                .then(
                  function(results) {
                    pushResults(message, results);
                  },
                  function(err) {
                    console.log(err);
                  }
                );
                break;
              default:
                break;
            }
          }
        });
      },
      ping = function() {
        subClient.ping(function (err, res) {
          console.log("redis server pinged");
        });
      },
      startPing = function() {
        new CronJob(
          '05 * * * * *',
          function() {
            ping();
          },
          null,
          true,
          'America/Chicago'
        );
      };

createClient().then(
  function(client) {
    subClient = client;
    startPing();
    setSubscription();
  }
);
if (env === 'development') {
  // Webpack imports
  var webpack = require('webpack'),
      WebpackPlugin = require('hapi-webpack-plugin'),
      webpackConfig = require('../webpack/dev.config');
}

// Start server function
export default function( HOST, PORT, callback ) {
  let plugins = [
        {
          register: Inert
        },
        {
          register: hapiRouter,
          options: {
            routes: 'routes/**/*.js' // uses glob to include files
          }
        },
        {
          register: h2o2
        },
        {
          register: cookieJwt
        }
      ],
      settings = nconf.argv()
       .env()
       .file({ file: path.join(__dirname, '../config/settings.json') });
  //console.log("mysql", settings.get("mysql"));
  const server = new Hapi.Server();
  server.connection(
    {
      host: settings.get("host") || HOST,
      port: settings.get("port") || PORT
    }
  );

  if (env === 'development') {
    const compiler = webpack( webpackConfig );
    const assets = {
      // webpack-dev-middleware options
      // See https://github.com/webpack/webpack-dev-middleware
      publicPath: '/hot',
      contentBase: 'src',
      stats: {
        colors: true,
        hash: false,
        timings: true,
        chunks: false,
        chunkModules: false,
        modules: false
      }
    };
    const hot = {
      // webpack-hot-middleware options
      // See https://github.com/glenjamin/webpack-hot-middleware
      timeout: '20000',
      reload: false
    };
    plugins.push({
      register: WebpackPlugin,
      options: { compiler, assets, hot }
    });
  }

  // Register Hapi plugins
  server.register(
    plugins,
    ( error ) => {
    if ( error ) {
      return console.error( error );
    }

    server.auth.strategy('accessToken', 'jwt-cookie', {
      key: cert,
      validateFunc: utils.validateJwt
    });

    /**
    * Attempt to serve static requests from the public folder.
    */

    server.ext( 'onPreResponse', ( request, reply ) => {
      const cookie = parseCookies(request.headers, "accessToken");
      const location = createLocation( request.path );
      let authenticated = false,
          retFunc = function(db, person) {
            console.log(authenticated);
            const data = Object.assign({}, db);
            const finalDb = JSON.stringify(data);
            const classes = new Classes(db);
            const appSettings = new Settings();
            appSettings.user = person;
            appSettings.authenticated = authenticated;
            const routes = createRoutes(appSettings);
            //console.log(finalDb);
            match({ routes, location }, ( error, redirectLocation, renderProps ) => {
              if ( error || !renderProps ) {
                // reply("500: " + error.message)
                reply.continue();
              } else if ( redirectLocation ) {
                reply.redirect( redirectLocation.pathname + redirectLocation.search );
              } else if ( renderProps ) {
                const reactString = ReactDOM.renderToString(
                  <Provider store={{classes: classes, settings: appSettings}}><RouterContext {...renderProps} /></Provider>
                );
                let settings = nconf.argv()
                   .env()
                   .file({ file: path.join(__dirname, '../config/settings.json') });
                const script = process.env.NODE_ENV === 'production' ? '/dist/client.min.js' : '/hot/client.js',
                      websocketUri =  settings.get("websocket:protocol")+"//"+settings.get("websocket:host")+":"+settings.get("websocket:port");
                let output = (
                  `<!doctype html>
                  <html lang="en-us">
                    <head>
                      <script>
                        var wsUri = '${websocketUri}',
                            dbJson = ${finalDb},
                            user = '${JSON.stringify(person)}';
                      </script>
                      <meta charset="utf-8">
                      <meta name="viewport" content="width=device-width, initial-scale=1">
                      <title>Congregation Class Management</title>
                      <link rel="stylesheet" href="/css/sanitize.css" />
                      <link rel="stylesheet" href="/chartist/css/chartist.min.css">
                      <link rel="shortcut icon" sizes="16x16 32x32 48x48 64x64 128x128 256x256" href="/favicon.ico?v2">
                      <link rel="stylesheet" href="http://fonts.googleapis.com/css?family=Roboto:300,400,500,700" type="text/css">
                      <link rel="stylesheet" type="text/css" href="https://cdnjs.cloudflare.com/ajax/libs/slick-carousel/1.3.15/slick.css" />
                      <link rel="stylesheet" type="text/css" href="https://cdnjs.cloudflare.com/ajax/libs/medium-editor/5.11.0/css/medium-editor.css" />
                      <link rel="stylesheet" type="text/css" href="https://cdnjs.cloudflare.com/ajax/libs/medium-editor/5.11.0/css/themes/default.css" />
                      <link rel="stylesheet" href="https://fonts.googleapis.com/icon?family=Material+Icons" />
                      <link rel="stylesheet" href="/css/custom.css" />
                    </head>
                    <body>
                      <div id="root"><div>${reactString}</div></div>
                      <script async=async src=${script}></script>
                    </body>
                  </html>`
                );
                let eTag = etag(output);
                reply(output).header('cache-control', 'max-age=0, private, must-revalidate').header('etag', eTag);
              }
            });
          },
          processRequest = function(person) {
            person = person || null;
            try {
              if ( typeof request.response.statusCode !== 'undefined' ) {
                return reply.continue();
              }

              if (!authenticated && request.path !== '/login') {
                throw new NotAuthorizedException('/login');
              } else if(authenticated && request.path === '/login') {
                console.log("error authenticated already");
                throw new RedirectException('/dashboard');
              }

              if (typeof(window) == 'undefined'){
                global.window = new Object();
              }

              const {headers} = request;

              global.navigator = {
                userAgent: headers['user-agent']
              };

              utils
              .getAllTables()
              .then(
                function(results) {
                  retFunc(results, person);

                },
                function(err) {
                  console.log(err);
                  retFunc(null, person);
                }
              );
            } catch (err) {
              if (err instanceof NotAuthorizedException) {
                console.log('redirect to login');
                reply.redirect('/login');
              } else if(err instanceof RedirectException) {
                console.log('redirect to dashboard');
                reply.redirect('/dashboard');
              }
            }
          };
      if (cookie) {
        //console.log("cookie", cookie);
        utils.validateJwt(cookie, cert)
        .then(
          function(person) {
            authenticated = true;
            processRequest(person);
          },
          function(err) {
            processRequest();
          }
        );
      } else {
        processRequest();
      }
    });
  });
  // Start Development Server
  return server.start(() => callback( server ));
}
