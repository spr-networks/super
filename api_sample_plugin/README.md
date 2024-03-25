## About

This is a code sample for how to create a plugin for SPR.
Also see https://github.com/spr-networks/spr-sample-plugin for a plugin with a UI

Check the [api docs](https://www.supernetworks.org/pages/docs/apis/overview#api-plugins) for information about how plugins work

## Buiding & Running

```
docker compose build
export SUPERDIR=/home/spr/super/ #path where super is
docker compose up
```

## API Calls

The plugin can export API extensions over a unix socket to the API.

## Configuring the plugin to auto-start

1. configure the plugin in the UI or 
2. Update the `configs/base/custom_compose_paths.json` to add the plugin. It is expected to be relative from the `super/` directory, for example `plugins/test/docker-comopse.yml`


## SPRBus notes

SPRBus is our event bus where the API can send events.
dcThe sample includes commented code for how to use it.
