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
        this._super();
        this._debug('Checking that git working directory is clean...');
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
        this._debug('Ensuring that revision data is present in the deploy context...');
        if (!context.revisionData) {
          return Promise.reject(
            'You must include `ember-cli-deploy-revision-data` plugin for `' + options.name + '` to work.'
          );
        }
      },


      fetchInitialRevisions: function() {
        return this._grabRevisionsList()
          .then(function(revisions) {
            return {
              initialRevisions: revisions
            };
          });
      },

      fetchRevisions: function() {
        return this._grabRevisionsList()
          .then(function(revisions) {
            return {
              revisions: revisions
            };
          });
      },

      _debug: function(message) {
        return this.log(message, {
          verbose: true
        });
      },

      _config: function() {
        if (!configCache) {
          this._debug('Building configuration cache...');
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
        var plugin = this;
        var config = this._config();
        this._debug('Grabbing revision list from the server...');
        return new Promise(function(resolve, reject) {
          var path = tmp.tmpNameSync({
            postfix: '.json'
          });
          plugin._rsync(
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

        this._debug('Running rsync command: ' + rsync.command());

        return new Promise(function(resolve, reject) {
          rsync.execute(function(error /*, code, cmd*/ ) {
            return error ? reject(error) : resolve();
          });
        });
      },

      _uploadRevisionsFile: function(revisions) {
        var plugin = this;
        var config = this._config();

        this._debug('Uploading revisions file...');

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
          plugin._rsync(
              path,
              config.userAtHost + ':' + config.revisionsFile,
              't'
            )
            .then(unlinkCleanup(path, resolve))
            .catch(unlinkCleanup(path, reject));
        });
      },

      _activateRevision: function(revision) {
        var plugin = this;
        var config = this._config();
        var currentPath = sysPath.resolve(config.releasesPath, config.currentPath);
        var revPath = config.releasesPath + '/' + revision;
        var link = sysPath.relative(sysPath.dirname(currentPath), revPath);

        this._debug('Activating revision `' + revision + '`...');

        return new Promise(function(resolve, reject) {
          var file = tmp.tmpNameSync();
          fs.symlink(link, file, 'dir', function(err) {
            if (err) {
              return unlinkCleanup(file, reject)(err);
            }
            plugin._rsync(file, config.userAtHost + ':' + currentPath, 'lt')
              .then(unlinkCleanup(file, resolve))
              .catch(unlinkCleanup(file, reject));
          });
        });
      },

      upload: function(context) {
        var plugin = this;
        var config = this._config();
        var rev = context.revisionData;
        var revision;
        var revPath = config.releasesPath + '/' + rev.revisionKey;
        var revisions = context.initialRevisions.filter(function(r) {
          return r.revision !== rev.revisionKey;
        }).map(function(r) {
          return Object.assign({}, r, {
            active: false
          });
        });


        return fullname().then(function(name) {
          revisions.push(revision = {
            version: rev.scm.sha,
            timestamp: rev.timestamp,
            revision: rev.revisionKey,
            active: true,
            deployer: username.sync() + (name ? ' - ' + name : ''),
          });
          plugin.log('Uploading revision `' + rev.revisionKey + '` (deployer: ' + revision.deployer + ')...');
          return Promise.all([
            plugin._rsync(
              config.sourcePath + '/',
              config.userAtHost + ':' + revPath + '/'
            ),
            plugin._activateRevision(rev.revisionKey),
            plugin._uploadRevisionsFile(revisions),
          ]);
        });
      },
    });

    return new DeployPlugin();
  }
};
