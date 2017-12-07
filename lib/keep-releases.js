var CoreObject = require('core-object');
var ssh2 = require('ssh2');
module.exports = CoreObject.extend({
  config: {},
  log: null,
  client: null,

  init: function() {
    this._super.init.apply(this, arguments);

    if (!this.client) {
      this.client = new ssh2.Client();
    }

    if (!this.log) {
      this.log = {
        info: function() {},
        error: function() {},
      };
    }
  },

  execute: function(command) {
    var that = this;

    return that._connect().then(function() {
      return that._executeCommand(command);
    });
  },

  _connect: function() {
    var that = this;

    return new Promise(function(resolve, reject) {
      that.client.on('ready', function() {
        resolve();
      });

      that.client.on('error', function(error) {
        that.log.error('✘ Unable to connect to ' + that.config.host);
        that.log.error(JSON.stringify(error));
        reject(error);
      });

      that.client.connect(that.config);
    });
  },

  _executeCommand: function(command) {
    var that = this;

    return new Promise(function(resolve, reject) {
      that.client.exec(command, function(err) {
        if (err) {
          that.log.error('✘ Unable to execute command: ' + command);
          reject(err);
        } else {
          that.log.info('✔ ' + command);
          resolve();
        }
      });
    });
  },
});
