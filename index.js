/* jshint node: true */
/* predef Promise */
'use strict';

var BasePlugin = require('ember-cli-deploy-plugin');
var Rsync = require('rsync');
var username = require('username');
var fullname = require('fullname');
var tmp = require('tmp');
var fs = require('fs');
var sysPath = require('path');
var childProcess = require('child_process');

function removeTrailingSlash(path) {
  return path.replace(/[\/\\]?$/, '');
}

function unlinkCleanup(file, callback) {
  var cleanup = function() {
    silentlyFail(fs.unlinkSync.bind(fs, file));
    if (callback) {
      callback.apply(null, arguments);
    }
  };
  if (!callback) {
    cleanup();
  } else {
    return cleanup;
  }
}

function silentlyFail(callback) {
  try {
    return {
      return: callback()
    };
  } catch (e) {
    return {
      error: e
    };
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


      configure: function() {
        return new Promise(function(resolve, reject) {
          childProcess.exec('git diff-index --quiet HEAD --', function(err) {
            if (err) {
              return reject('Git working directory is not clean, commit any change before using `ember deploy`');
            }
            resolve();
          });
        });
      },

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
          var path = tmp.tmpNameSync({
            postfix: '.json'
          });
          this._rsync(
              config.userAtHost + ':' + config.revisionsFile,
              path,
              't'
            )
            .then(function() {
              return require(path).data;
            })
            .then(unlinkCleanup(path, resolve))
            .catch(unlinkCleanup(path, reject));
        });
      },

      _rsync: function(source, destination, flags) {
        var config = this._config();

        var rsync = new Rsync()
          .shell('ssh -p ' + config.port)
          .flags(flags || config.flags)
          .source(source)
          .destination(destination);

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
          var path = tmp.tmpNameSync({
            postfix: '.json'
          });
          try {
            fs.writeFileSync(path, JSON.stringify({
              data: revisions
            }));
          } catch (err) {
            return unlinkCleanup(path, reject)(err);
          }
          this._rsync(
              path,
              config.userAtHost + ':' + config.releasesPath + '/' + config.revisionsFile,
              't'
            )
            .then(unlinkCleanup(path, resolve))
            .catch(unlinkCleanup(path, reject));
        });
      },

      _activateRevision: function(revision) {
        var config = this._config();
        var currentPath = sysPath.resolve(config.releasesPath, config.currentPath);
        var revPath = config.releasesPath + '/' + revision;
        var link = sysPath.relative(sysPath.dirname(currentPath), revPath);

        return new Promise(function(resolve, reject) {
          var file = tmp.tmpNameSync();
          fs.symlink(link, file, 'dir', function(err) {
            if (err) {
              return unlinkCleanup(file, reject)(err);
            }
            this._rsync(file, config.userAtHost + ':' + currentPath, 't')
              .then(unlinkCleanup(file, resolve))
              .catch(unlinkCleanup(file, reject));
          });
        });
      },

      upload: function(context) {
        var config = this._config();
        var rev = context.revisionData;
        var revPath = config.releasesPath + '/' + rev.revisionKey;
        var revisions = context.initialRevisions.map(function(revision) {
          return Object.assign({}, revision, {active: false});
        });

        return fullname.then(function(name) {
          revisions.push({
            version: rev.scm.sha,
            timestamp: rev.timestamp,
            revision: rev.revisionKey,
            active: true,
            deployer: username.sync() + (name ? ' (' + name + ')' : ''),
          });
          return Promise.all([
            this._rsync(
              config.sourcePath + '/',
              config.userAtHost + ':' + revPath + '/'
            ),
            this._activateRevision(rev.revisionKey),
            this._uploadRevisionsFile(revisions),
          ]);
        });
      },
    });

    return new DeployPlugin();
  }
};
