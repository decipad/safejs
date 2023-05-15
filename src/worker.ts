const whitelist = {
  self: 1,
  postMessage: 1,
  global: 1,
  whiteList: 1,
  eval: 1,
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
  EvalError: 1,
  RangeError: 1,
  ReferenceError: 1,
  SyntaxError: 1,
  TypeError: 1,
  URIError: 1,
  decodeURI: 1,
  decodeURIComponent: 1,
  encodeURI: 1,
  encodeURIComponent: 1,
  isFinite: 1,
  isNaN: 1,
  parseFloat: 1,
  parseInt: 1,
  Infinity: 1,
  JSON: 1,
  Math: 1,
  NaN: 1,
  undefined: 1,

  Intl: 1,
  console: 1,
  setTimeout: 1,
  constructor: 1,
  fetch: 1,
};

Object.getOwnPropertyNames(self).forEach((prop) => {
  if (prop in whitelist) return;

  Object.defineProperty(self, prop, {
    get: function () {
      port.postMessage("stop using " + prop);
      throw new Error("Security Exception - cannot access: " + prop);
    },
    configurable: false,
  });
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

let port: MessagePort;

function userCodeWrapper(code: string) {
  return `
    async function usersCode() {
      ${code}
    }

    const retValue = await usersCode();
    retValue;
  `;
}

const MAX_RETURN = 20000;

self.onmessage = async (msg) => {
  if (msg.ports.length > 0 && port == null) {
    console.log("Setting up the port");
    port = msg.ports[0];
    port.postMessage("yooo from worker");
    return;
  }

  const result = await Object.getPrototypeOf(async function () {}).constructor(
    msg.data
  )();

  if (!result) {
    port.postMessage("Nothing returned");
    return;
  }

  try {
    const parsedResult = JSON.stringify(result);
    if (parsedResult.length > MAX_RETURN) {
      port.postMessage("Result was too long");
      return;
    }

    port.postMessage(result);
  } catch (e) {
    port.postMessage("JSON stringify went kaput " + e);
  }
};
