# safejs

This repo intends to safely run JavaScript into a website using web workers. It provides a controller class, with some defaults.

## Usage example

```ts
const myWorker = new SafeJs(
  // Success callback
  (successMessage) => {
    console.log(successMessage);
  },
  // Errors callback
  (err) => console.error(err),
  {
    maxExecutingTime: 50000,
  }
);

myWorker.execute('return "Hello World"')
```

## Parameters
As seen above, the third parameter for the `SafeJS` constructor is a series of options.

```ts
export interface SafeJsOptions {
  maxWorkerReturn: number; // Number of characters the stringified result is allowed to return. Default 10000.
  maxExecutingTime: number; // Kill the worker after not returning this number of milliseconds. Default 20000.
  maxConsoleLog: number; // Max number of logs returned. Default 200.
  extraWhitelist: Array<string>; // Objects you wish to whitelist and thus allow the user to use in their code.

  fetchProxyUrl: string | undefined; // Replaces the default `fetch` URL if provided.
}
```

## dev install

to test this package you need to set up with `link` (insert zelda pun):

In this repo:

```
pnpm link
```

Wherever you are using it

```
pnpm link "@decipad_org/safejs
```

If you use a builder, like webpack, you might have to rebuild. This is an example of how that might look like (in the safejs repo):

```
pnpm run build
```

## Inspiration

This package was partially inspired by (Wumpus World)[https://github.com/Domiii/WumpusGame/blob/master/js/script/GuestScriptContext.js]
