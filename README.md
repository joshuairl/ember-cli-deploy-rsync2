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
  const ENV = {
  };

  if (environment === 'production') {
    ENV.rsync2 = {
      host: '<host>',
      username: '<username>',
      releasesPath: '<remote-path>'
    }
  }
  return ENV;
};

```
and start deploying:
```bash
ember deploy production
```

## Configuration Options

Option name | Description | Default | Examples
---: | --- | :---: | ---
`username` | SSH user name | **required** | `huafu`
`host` | SSH host | **required** | `example.com`
`releasesPath` | Path where all revisions will be uploaded (each revision will be in a separate folder based on the revision name) | **required** | `/var/www/example.com/revisions`
`port` | SSH port | `22` | `2222`
`sourcePath` | Path of the directory that will be uploaded | `tmp/deploy-dist` | `some/local/path`
`exclude` | Exclude specified files and directories from uploading | `null`, | `['.htaccess', 'private']`
`include` | Include specified files and directories back from exclude (if `exclude` is not defined, it'll be set to `*`) | `null`, | `images/*`
`flags` | Flags to pass to the [rsync](https://www.npmjs.com/package/rsync#flagsflags-set) command | `rtu` | `ar`
`currentPath` | Name of the symbolic link that will be created, pointing to the current deployed version. It can be relative to the `releasesPath`, or absolute. The created link will be relative anyway | `current` | `../current`
`revisionFile` | Name of the remote file which will hold the list of revisions. This file is relative to the `releasesPath` | `revisions.json` | `../rev-manifest.json`
`deployerFormat` | Format string for the deployer (`{userFullName}`, `{userName}` and `{user}` are possible variables, `{user}` will be replaced with the user full name if found, else user name | `{user}` | `Huafu`
