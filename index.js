/* jshint node: true */
/* predef Promise */
'use strict';

var BasePlugin = require('ember-cli-deploy-plugin');
var Rsync = require('rsync');
var scpClient = require('scp2');
var tmp = require('tmp');
var fs = require('fs');
var sysPath = require('path');

function removeTrailingSlash(path) {
  return path.replace(/[\/\\]?$/, '');
}


function silentlyFail(callback) {
  try {
    return {return: callback()};
  } catch (e) {
    return {error: e};
  }
}

module.exports = {
  name: 'ember-cli-deploy-rsync',

  createDeployPlugin: function(options) {
    var configCache;

    var DeployPlugin = BasePlugin.extend({
      name: options.name,

      defaultConfig: {
        port: '22',
        sourcePath: 'tmp/deploy-dist',
        currentPath: 'current',
        exclude: false,
        flags: 'rtvu',
        revisionsFile: 'revisions.json',
      },

      requiredConfig: ['username', 'releasesPath', 'host'],

      didPrepare: function(context) {
        if (!context.revisionData) {
          return Promise.reject(
            'You must include `ember-cli-deploy-revision-data` plugin for `' + options.name + '` to work.'
          );
        }
      },


      fetchInitialRevisions: function() {
        return this._grabRevisionsList().then(function(revisions) {
          return {
            initialRevisions: revisions
          };
        });
      },

      fetchRevisions: function() {
        return this._grabRevisionsList().then(function(revisions) {
          return {
            revisions: revisions
          };
        });
      },

      _config: function() {
        if (!configCache) {
          var releasesPath = removeTrailingSlash(this.readConfig('releasesPath'));
          var currentPath = this.readConfig('currentPath');

          configCache = {
            currentPath: sysPath.isAbsolute(currentPath) ? sysPath.relative(releasesPath, currentPath) : currentPath,
            releasesPath: releasesPath,
            sourcePath: removeTrailingSlash(this.readConfig('sourcePath')),
            revisionsFile: releasesPath + '/' + this.readConfig('revisionsFile'),
            username: this.readConfig('username'),
            host: this.readConfig('host'),
            port: this.readConfig('port'),
            userAtHost: this.readConfig('username') + '@' + this.readConfig('host'),
            flags: this.readConfig('flags'),
            exclude: this.readConfig('exclude'),
          };
        }
        return configCache;
      },

      _grabRevisionsList: function() {
        var config = this._config();

        return new Promise(function(resolve, reject) {
          tmp.file({
            postfix: '.json'
          }, function(err, path, fd, cleanupCallback) {
            scpClient.scp({
              username: config.username,
              host: config.host,
              path: config.revisionsFile
            }, path, function(err) {
              if (err) {
                silentlyFail(cleanupCallback);
                return reject(err);
              }
              var revisions = require(path);
              silentlyFail(cleanupCallback);
              resolve(revisions);
            });
          });
        });
      },

      _rsync: function(source, destination, flags) {
        var config = this._config();

        var rsync = new Rsync()
          .shell('ssh -p ' + config.port)
          .flags(flags || config.flags)
          .source(source)
          .destination(config.userAtHost + ':' + destination);

        if (config.exclude) {
          rsync.set('exclude', config.exclude);
        }

        return new Promise(function(resolve, reject) {
          rsync.execute(function(error, code, cmd) {
            return error ? reject(error) : resolve({
              code: code,
              command: cmd
            });
          });
        });
      },

      _uploadRevisionsFile: function(revisions) {
        var config = this._config();

        return new Promise(function(resolve, reject) {
          tmp.file({
            postfix: '.json'
          }, function(err, path, fd, cleanupCallback) {
            if (err) {
              return reject(err);
            }
            try{
            fs.writeFileSync(fd, JSON.stringify({
              data: revisions
            }));
          }catch(err){
            silentlyFail(cleanupCallback);
            reject(err);
          }
            this._rsync(
              path,
              config.releasesPath + '/' + config.revisionsFile,
              't'
            ).then(function() {
              silentlyFail(cleanupCallback);
              resolve();
            }).catch(function(err) {
              silentlyFail(cleanupCallback);
              reject(err);
            });
          });
        });
      },

      upload: function(context) {
        var config = this._config();
        var rev = context.revisionData;
        var revPath = config.releasesPath + '/' + rev.revisionKey;
        var currentPath = sysPath.resolve(config.releasesPath, config.currentPath);
        var link = sysPath.relative(sysPath.dirname(currentPath), revPath);
        var revisions = context.initialRevisions.map(function(revision){
          return Object.assign({}, revision)
        });

        revisions.push({
          version: rev.scm.sha,
          timestamp: rev.timestamp,
          revision: rev.revisionKey,
          active: true,
          deployer: process.env.USER
        });

        return Promise.all([
          this._rsync(
            config.sourcePath + '/',
            revPath + '/'
          ),
          this._uploadRevisionsFile(revisions),
        ]);
      },

      didUpload: function(context) {

      },
    });

    return new DeployPlugin();
  }
};
