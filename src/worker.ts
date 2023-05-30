import { WorkerInitMessage } from "./main";

function initialize(extraWhitelist: Array<string>) {
  const extraWhitelistObject = {} as any;
  for (const v of extraWhitelist) {
    extraWhitelistObject[v] = 1;
  }

  const whitelist = {
    self: 1,
    postMessage: 1,
    global: 1,
    whiteList: 1,
    Array: 1,
    Boolean: 1,
    Date: 1,
    Function: 1,
    Promise: 1,
    Number: 1,
    Object: 1,
    RegExp: 1,
    String: 1,
    Error: 1,
    RangeError: 1,
    ReferenceError: 1,
    SyntaxError: 1,
    TypeError: 1,
    URIError: 1,
    decodeURI: 1,
    decodeURIComponent: 1,
    encodeURI: 1,
    isFinite: 1,
    isNaN: 1,
    parseFloat: 1,
    parseInt: 1,
    Infinity: 1,
    JSON: 1,
    Math: 1,
    NaN: 1,
    undefined: 1,
    Map: 1,

    Intl: 1,
    constructor: 1,
    fetch: 1,
    console: 1,

    ...extraWhitelistObject,
  };

  Object.getOwnPropertyNames(self).forEach((prop) => {
    if (prop in whitelist) return;

    try {
      Object.defineProperty(self, prop, {
        get: function () {
          port.postMessage("stop using " + prop);
          throw new Error("Security Exception - cannot access: " + prop);
        },
        configurable: false,
      });
    } catch (e) {}
  });

  // @ts-ignore
  Object.defineProperty(Array.prototype, "join", {
    writable: false,
    configurable: false,
    value: (function (old) {
      // @ts-ignore
      return function (arg) {
        // @ts-ignore
        if (this.length > 500 || (arg && arg.length > 500)) {
          throw "Exception: too many items";
        }

        // @ts-ignore
        return old.apply(this, arguments);
      };
    })(Array.prototype.join),
  });

  const arProt = Array.prototype;

  // @ts-ignore
  Array = function (args) {
    if (args && args > 500) {
      throw "Exception: too many items";
    }
    return arProt.constructor(args);
  };

  // @ts-ignore
  Array.prototype = arProt;

  Object.getOwnPropertyNames(console).forEach((prop) => {
    if (prop !== "log") {
      Object.defineProperty(console, prop, {
        configurable: false,
        get: function () {
          throw new Error("Security Exception - cannot access: " + prop);
        },
      });
    }
  });

  console.log = function (arg) {
    try {
      if (typeof arg === "string") {
        port.postMessage(arg);
      } else if (typeof arg === "number") {
        port.postMessage(arg.toString());
      } else if (typeof arg === "object") {
        port.postMessage(JSON.parse(arg));
      } else {
        port.postMessage(new Error("Cannot log this type"));
      }
    } catch (e) {
      port.postMessage(new Error("console.log went wrong somewhere"));
    }
  };

  function removeProto(currentProto: any) {
    Object.getOwnPropertyNames(currentProto).forEach((prop) => {
      // Just for testing
      if (prop in whitelist) return;
      if (prop === "self") return;

      try {
        Object.defineProperty(currentProto, prop, {
          get: () => {
            port.postMessage("stop using " + prop);
            throw new Error("Security Exception - cannot access: " + prop);
          },
          configurable: false,
        });
      } catch (e) {
        // console.log(e);
      }
    });
  }

  // @ts-ignore
  removeProto(self.__proto__);
  // @ts-ignore
  removeProto(self.__proto__.__proto__);
}

var port: MessagePort;
let MAX_RETURN = 20000;

self.onmessage = async (msg) => {
  if (msg.ports.length > 0 && port == null) {
    const initMessage = msg.data as WorkerInitMessage;
    MAX_RETURN = initMessage.maxWorkerReturn;
    initialize(initMessage.extraWhitelist);

    port = msg.ports[0];
    return;
  }

  try {
    const result = await Object.getPrototypeOf(
      async function () {}
    ).constructor(msg.data)();

    // JSON.stringify can yield undefined when result is undefined
    const parsedResult: string | undefined = JSON.stringify(result);

    if (!parsedResult) {
      // JSON.parse fails on `undefined`, but not on `null`.
      port.postMessage("null");
      return;
    }

    if (parsedResult.length > MAX_RETURN) {
      port.postMessage(
        new Error(
          "Worker result is past the max allowed length (Try increasing the length when creating the worker object)"
        )
      );
      return;
    }

    port.postMessage(parsedResult);
  } catch (e) {
    port.postMessage(e);
    return;
  }
};
