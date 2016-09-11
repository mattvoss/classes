import models from '../../models';
import async from 'async';
import Promise from 'bluebird';

export default {
  add(personId) {
    return new Promise(function(resolve, reject){
      async.waterfall(
        [
          function(callback) {
            models.Students.findOrCreate(
              {
                where: {
                  peopleId: personId
                }
              }
            ).spread(
              function(student, created) {
                callback(null, student);
              },
              function(err){
                callback(err);
              }
            );
          },
          function(student, callback) {
            models.People.findOne(
              {
                where: {
                  id: personId
                },
                include: [
                  {
                    model: models.Teachers
                  },
                  {
                    model: models.Students
                  }
                ]
              }
            ).then(
              function(people) {
                callback(null, people);
              },
              function(err){
                callback(err);
              }
            );
          }
        ],
        function(error, result) {
          if (error) {
            let result = {
              error: err,
              record: null
            };
            reject(result);
            return null;
          } else {
            resolve(result);
            return null;
          }
        }
      );
    });
  },
  delete(personId) {
    return new Promise(function(resolve, reject){
      async.waterfall(
        [
          function(callback) {
            models.Students.findOne(
              {
                where: {
                  peopleId: personId
                }
              }
            ).then(
              function(student) {
                callback(null, student);
              },
              function(err){
                callback(err);
              }
            );
          },
          function(student, callback) {
            student
            .destroy()
            .then(
              function(people) {
                callback(null, student);
              },
              function(err){
                callback(err);
              }
            );
          },
          function(student, callback) {
            models.People.findOne(
              {
                where: {
                  id: personId
                },
                include: [
                  {
                    model: models.Teachers
                  },
                  {
                    model: models.Students
                  }
                ]
              }
            ).then(
              function(people) {
                callback(null, people);
              },
              function(err){
                callback(err);
              }
            );
          }
        ],
        function(error, result) {
          if (error) {
            let result = {
              error: err,
              record: null
            };
            reject(result);
            return null;
          } else {
            resolve(result);
            return null;
          }
        }
      );
    });
  },
  all() {
    return new Promise((resolve, reject) => {
      models.Students.findAll(
        {
          order: [
            ['updatedAt', 'DESC'],
          ],
        }
      ).then(
        (result) => {
          resolve(result);
          return null;
        },
        (err) => {
          console.log(err);
          reject(err);
          return null;
        }
      );
    });
  }
};
