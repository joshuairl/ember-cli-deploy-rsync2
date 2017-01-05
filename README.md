# ember-cli-deploy-rsync2
Easily deploy your Ember applications to a remote server using scp via rsync.

## Installation
Install ember-cli-deploy first:
```bash
ember install ember-cli-deploy
```
Install ember-cli-deploy-build for automated building:
```bash
ember install ember-cli-deploy-build
```
Install ember-cli-deploy-revision-data to keep track of deployed revisions:
```bash
ember install ember-cli-deploy-revision-data
```
Then install ember-cli-deploy-rsync2 plugin (this plugin)
```bash
ember install ember-cli-deploy-rsync2
```
## Usage
Edit your `config/deploy.js` file:
```javascript
module.exports = function(environment){
  var ENV = {
  };

  if (environment === 'production') {
    ENV.rsync2 = {
      host: '<host>',
      username: '<username>',
      releasesPath: '<remote-path>'
    }
  };
  return ENV;
};

```
and start deploying:
```bash
ember deploy production
```

## Configuration Options


#### username 
Username to connect via SSH.
**required**
#### host 
Host (server address) to connect via SSH.
**required**
#### releasesPath
Path where all revisions will be uploaded (each revision will be in a separate folder based on the revision name).
**required**
#### port 
SSH port on target server, default: `22`.
**optional**
#### sourcePath 
Path of the directory that will be uploaded, default: `tmp/deploy-dist`.
**optional**
#### exclude
Exclude specified files and directories from uploading.
**optional**
#### include
Include specified files and directories back from exclude (if `exclude` is not defined, it'll be set to `*`).
**optional**
#### flags
Flags to pass to the [rsync](https://www.npmjs.com/package/rsync#flagsflags-set) command, default: `rtu`.
**optional**
#### currentPath
Name of the symbolic link that will be created, pointing to the current deployed version, default: `current`.
It can be relative to the `releasesPath`, or absolute. The created link will be relative anyway.
**optional**
#### revisionsFile
Name of the remote file which will hold the list of revisions, default: `revisions.json`.
This file is relative to the `releasesPath`.
**optional**
