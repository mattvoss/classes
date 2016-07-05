import { extendObservable, observable, autorun, isObservable, isObservableMap, map, action, runInAction } from "mobx";
import _ from 'lodash';
import each from 'async/each';
import loki from 'lokijs';
import moment from 'moment-timezone';
import api from '../api';
import * as types from '../constants';
import conv from 'binstring';
import iouuid from 'innodb-optimized-uuid';
import Promise from 'bluebird';

export default class Db {
  db;
  ws;
  collections = {};
  @observable isUpdating = false;
  
  constructor(data, websocket) {
    this.isUpdating = true;
    this.db = new loki('evangelize');
    let self = this;
  }

  init(data, websocket) {
    let self = this;
    return new Promise(function(resolve, reject){
      if (websocket) {
        self.setupWs(websocket);
      }
      let indices = {
        divisionClasses: ['classId', 'divisionId', 'deletedAt'],
        divisionClassTeachers: ['divisionClassId', 'day', 'deletedAt'],
        //divisionClassAttendance: ['divisionClassId', 'day', 'attendanceDate', 'deletedAt'],
        divisionYears: ['divisionConfigId', 'startDate', 'endDate' ,'deletedAt'],
        divisions:  ['divisionConfigId', 'divisionYear', 'start', 'end', ' deletedAt'],
      };
      each(
        Object.keys(data),
          function(key, callback) {
          //console.log("collection", key, data[key]);
          let index = (key in indices) ? indices[key] : [];
          let coll = self.db.addCollection(
            key,
            {
              asyncListeners: true, 
              disableChangesApi: true, 
              clone: false,
              unique: ['id'],
              indices: index
            }
          );
          self.collections[key] = coll;
          extendObservable(self.collections[key], {data: coll.data})
          if (data[key].length) {
            if ("$loki" in data[key][0]) {
              coll.update(data[key]);
            } else {
              coll.insert(data[key]);
            }
          }
          self.collections[key].setChangesApi(true);
          //data[coll.name] = coll.data;
          coll.on('update', ((...args)=>self.collectionChange(coll.name, 'update', ...args)));
          coll.on('insert', ((...args)=>self.collectionChange(coll.name, 'insert', ...args)));
          callback(null)
        },
        function(err) {
          self.isUpdating = false;
          resolve(true);
        }
      );
    });
  }
  
  async setupWs(websocket) {
    let self = this;
    this.ws = websocket;

    this.ws.on('changes', data => {
      //console.log('changes', data);
      self.wsHandler(self.ws, data);
    });
    this.ws.emitAsync = Promise.promisify(this.ws.emit);
    return true;
  }

  collectionChange(collection, type, target) {
    console.log(moment().unix(), collection, type, target);
  }

  async wsHandler(ws, update) {
    let data = update.payload.data,
        record;
    //console.log("websocket:", ws);
    //console.log("websocket update:", update);
    console.log("wsHandler", moment().unix());
    if (data.error) {
      if (data.error.name === 'SequelizeUniqueConstraintError') {
        record = await this.collections[data.collection]
                .findOne(
                  {
                    $and: [
                      {
                        id: data.prior.id
                      }
                    ]
                  }
                );
        this.updateCollection(data.collection, record, true, deleted);
        record = await this.collections[data.collection]
                .findOne(
                  {
                    $and: [
                      {
                        id: data.record.id
                      }
                    ]
                  }
                );
        if (record) {
          let deleted = (data.type === "delete") ? true : false;
          record = Object.assign(record, data.record);
          return await this.updateCollection(data.collection, record, true, deleted);
        } else if (data.type !== "delete") {
          return await this.insertDocument(data.collection, data.record);
        }
      }
    } else if (data.type === "insert" || data.type === "update" || data.type === "delete") {
      record = this.collections[data.collection]
                .findOne(
                  {
                    $and: [
                      {
                        id: data.record.id
                      }
                    ]
                  }
                );
      if (record) {
        let deleted = (data.type === "delete") ? true : false;
        record = Object.assign(record, data.record);
        return await this.updateCollection(data.collection, record, true, deleted);
      } else if (data.type !== "delete") {
        return await this.insertDocument(data.collection, data.record);
      }

    } else {
      return false;
    }
  }

  updateCollectionFields(collection, id, updates) {
    let record = this.collections[collection]
                .findOne(
                  {
                    $and: [
                      {
                        id: id
                      },
                      {
                        deletedAt: null
                      }
                    ]
                  }
                );
    if (record) {
      record = Object.assign({}, record, updates);
      return this.updateCollection(collection, record, false);
    }
  }

  @action async deleteRecord(collection, id) {
    const ts = moment.utc().format("YYYY-MM-DDTHH:mm:ss.sssZ");
    let record = await this.collections[collection]
                .findOne(
                  {
                    $and: [
                      {
                        id: id
                      }
                    ]
                  }
                );
    if (record) {
      record.deletedAt = ts;
      return await this.updateCollection(collection, record, false, true);
    } else {
      return null;
    }
  }

  @action async updateCollection(collection, record, remote, deleted) {
    console.log("updateCollection", moment().unix());
    deleted = deleted || false;
    remote = remote || false;
    const ts = moment.utc().format("YYYY-MM-DDTHH:mm:ss.sssZ");
    let results, type = 'insert',
        self = this;
    const sendRemote = function(record) {
      return new Promise(function(resolve, reject){
        if (!remote) {
          console.log("updateCollection:emit", moment().unix());
          self.ws.emitAsync(
            type,
            {
              type: type,
              collection: collection,
              target: record
            }
          ).then(
            function(data) {
              resolve(data);
            }
          );
        } else {
          resolve(true);
        }
      });
    };
    if (record) {
      if (record.id) {
        console.log("updateCollection:pre-update", moment().unix());
        type = (deleted) ? 'delete' : 'update';
        record.updatedAt = ts;
        if (deleted) {
          this.collections[collection].remove(record);
          console.log("updateCollection:removed", moment().unix());
          results = record;
        } else {
          results = await this.collections[collection].update(record);
          console.log("updateCollection:updated", moment().unix());
        }
        sendRemote(record);
      } else {
        
        record.createdAt = ts;
        record.updatedAt = ts;
        console.log("updateCollection:pre-guid", moment().unix());
        record.id = iouuid.generate().toLowerCase();
        console.log("updateCollection:guid", moment().unix());
        console.log("updateCollection:pre-insert", moment().unix());
        results = this.insertDocument(collection, record).then(
          function(data) {
            console.log("updateCollection:inserted", moment().unix());
            sendRemote(record);
          }
        );
        
      }
    }
  }

  @action insertDocument(collection, record) {
    let self = this;
    return new Promise(function(resolve, reject){
      let result = self.collections[collection].insert(record);
      resolve(result);
    });
  }

}
