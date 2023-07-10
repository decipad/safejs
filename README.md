# safejs

This repo intends to safely run JavaScript into a website using web workers

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
