# SparkleScript

SparkleScript lets custom mods run JavaScript inside the patched app. Enable it under **Settings → sparklecat's mods → Custom mods**, then import and enable a `.sparkle` file. It is off by default. Only run code you trust: scripts can read and modify app data and files, access the network and native modules, change the interface, and crash the app.

## Writing a mod

Create a UTF-8 `.sparkle` file in a text editor. The first line is metadata; the remaining lines are JavaScript. Name and semantic version are required; description is optional.

```js
// sparkle {"name":"My mod","version":"1.0.0","description":"An app wrapper"}
const {React, ReactNative} = api;
function MyWrapper({children}) {
  return React.createElement(ReactNative.View, {style: {flex: 1}},
    children,
    React.createElement(ReactNative.Text, {style: {color: '#c59cff'}}, 'Hello!'));
}
api.wrapApp(MyWrapper);
const timer = setInterval(() => console.log('Mod is running'), 60000);
api.onDispose(() => clearInterval(timer));
```

Enabled JavaScript mods start after the app unlocks, or when enabled in the menu. Each runs once per activation. Disabling or replacing a mod calls its registered cleanup functions and removes its app wrappers. Changes to storage, network services, or other side effects remain until your code reverses them; restart the app if needed. Initialization errors are shown in an alert. Handle errors in asynchronous code yourself.

## API

- `api.React`: the app's React instance; use `createElement` for interface components.
- `api.ReactNative`: React Native components, APIs, and `NativeModules` available in the host.
- `api.store`: the app's Zustand `useAppStore` hook, including `getState`, `setState`, and `subscribe`. Inspect the upstream app store for its current data and actions; those can change between versions.
- `api.storage`: AsyncStorage, for reading and writing app storage.
- `api.files`: react-native-blob-util, including its filesystem and networking APIs.
- `api.fetch`: the app's fetch function.
- `api.css`: convert CSS-style declarations into a React Native style object. Use `api.css('color: red; padding: 12px')` or a JavaScript tagged template, then pass the result as a component's `style` prop.
- `api.wrapApp(Component)`: wrap the app with a React component receiving `children`. A wrapper can add UI or replace its children entirely. Multiple wrappers are supported.
- `api.onDispose(callback)`: register a synchronous cleanup function for subscriptions, timers, and other resources.

Scripts also have the JavaScript globals supplied by the app's runtime. Availability of native modules and app internals depends on the installed app version. Scripts must be plain JavaScript supported by the installed Hermes runtime; compile JSX, TypeScript, and external dependencies into one file first. Scripts are limited to 1 MiB each and 20 imported mods.

## CSS-style declarations

```js
const card = api.css`background-color: #302540; padding: 16px; border-radius: 12px;`;
const title = api.css`color: white; font-size: 18px; font-weight: 700;`;
// React.createElement(api.ReactNative.View, {style: card}, ...)
```

The helper supports common React Native layout, spacing, border, text, and color properties. Numbers and `px` become device-independent numbers; supported dimensions also accept percentages. Use separate declarations such as `margin-top` and `margin-right` rather than CSS shorthand with multiple values. Unsupported properties and numeric formats throw an error; string values must be valid for React Native. This is a declaration converter, not a browser stylesheet: selectors, cascading, media queries, animations, and automatic styling of existing app screens are not supported. Use the returned styles on components your script creates; `api.wrapApp` can place those components around the app.

For HTML tables in member custom fields, use the separate opt-in [table setting](README.md#tables-in-custom-fields); a script is not required.

## Earlier scripts

The original `mod "Name" version "1.0.0" { ... }` syntax remains supported, including `when open`, `when tap`, `show`, and `allow appearance`/`accent`. These scripts also require the master switch. Existing per-mod enable settings are preserved, but no scripts run until SparkleScript is enabled.
