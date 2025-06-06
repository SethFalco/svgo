/**
 * @fileoverview Based on https://www.w3.org/TR/SVG11/paths.html#PathDataBNF.
 */

import { removeLeadingZero, toFixed } from './svgo/tools.js';

/**
 * @typedef {'none' | 'sign' | 'whole' | 'decimal_point' | 'decimal' | 'e' | 'exponent_sign' | 'exponent'} ReadNumberState
 *
 * @typedef StringifyPathDataOptions
 * @property {ReadonlyArray<import('./types.js').PathDataItem>} pathData
 * @property {number=} precision
 * @property {boolean=} disableSpaceAfterFlags
 */

const argsCountPerCommand = {
  M: 2,
  m: 2,
  Z: 0,
  z: 0,
  L: 2,
  l: 2,
  H: 1,
  h: 1,
  V: 1,
  v: 1,
  C: 6,
  c: 6,
  S: 4,
  s: 4,
  Q: 4,
  q: 4,
  T: 2,
  t: 2,
  A: 7,
  a: 7,
};

/**
 * @param {string} c
 * @returns {c is import('./types.js').PathDataCommand}
 */
const isCommand = (c) => {
  return c in argsCountPerCommand;
};

/**
 * @param {string} c
 * @returns {boolean}
 */
const isWhiteSpace = (c) => {
  return c === ' ' || c === '\t' || c === '\r' || c === '\n';
};

/**
 * @param {string} c
 * @returns {boolean}
 */
const isDigit = (c) => {
  const codePoint = c.codePointAt(0);
  if (codePoint == null) {
    return false;
  }
  return 48 <= codePoint && codePoint <= 57;
};

/**
 * @param {string} string
 * @param {number} cursor
 * @returns {[number, ?number]}
 */
const readNumber = (string, cursor) => {
  let i = cursor;
  let value = '';
  /** @type {ReadNumberState} */
  let state = 'none';
  for (; i < string.length; i += 1) {
    const c = string[i];
    if (c === '+' || c === '-') {
      if (state === 'none') {
        state = 'sign';
        value += c;
        continue;
      }
      if (state === 'e') {
        state = 'exponent_sign';
        value += c;
        continue;
      }
    }
    if (isDigit(c)) {
      if (state === 'none' || state === 'sign' || state === 'whole') {
        state = 'whole';
        value += c;
        continue;
      }
      if (state === 'decimal_point' || state === 'decimal') {
        state = 'decimal';
        value += c;
        continue;
      }
      if (state === 'e' || state === 'exponent_sign' || state === 'exponent') {
        state = 'exponent';
        value += c;
        continue;
      }
    }
    if (c === '.') {
      if (state === 'none' || state === 'sign' || state === 'whole') {
        state = 'decimal_point';
        value += c;
        continue;
      }
    }
    if (c === 'E' || c == 'e') {
      if (
        state === 'whole' ||
        state === 'decimal_point' ||
        state === 'decimal'
      ) {
        state = 'e';
        value += c;
        continue;
      }
    }
    break;
  }
  const number = Number.parseFloat(value);
  if (Number.isNaN(number)) {
    return [cursor, null];
  } else {
    // step back to delegate iteration to parent loop
    return [i - 1, number];
  }
};

/**
 * @param {string} string
 * @returns {import('./types.js').PathDataItem[]}
 */
export const parsePathData = (string) => {
  /** @type {import('./types.js').PathDataItem[]} */
  const pathData = [];
  /** @type {?import('./types.js').PathDataCommand} */
  let command = null;
  let args = /** @type {number[]} */ ([]);
  let argsCount = 0;
  let canHaveComma = false;
  let hadComma = false;
  for (let i = 0; i < string.length; i += 1) {
    const c = string.charAt(i);
    if (isWhiteSpace(c)) {
      continue;
    }
    // allow comma only between arguments
    if (canHaveComma && c === ',') {
      if (hadComma) {
        break;
      }
      hadComma = true;
      continue;
    }
    if (isCommand(c)) {
      if (hadComma) {
        return pathData;
      }
      if (command == null) {
        // moveto should be leading command
        if (c !== 'M' && c !== 'm') {
          return pathData;
        }
      } else if (args.length !== 0) {
        // stop if previous command arguments are not flushed
        return pathData;
      }
      command = c;
      args = [];
      argsCount = argsCountPerCommand[command];
      canHaveComma = false;
      // flush command without arguments
      if (argsCount === 0) {
        pathData.push({ command, args });
      }
      continue;
    }
    // avoid parsing arguments if no command detected
    if (command == null) {
      return pathData;
    }
    // read next argument
    let newCursor = i;
    let number = null;
    if (command === 'A' || command === 'a') {
      const position = args.length;
      if (position === 0 || position === 1) {
        // allow only positive number without sign as first two arguments
        if (c !== '+' && c !== '-') {
          [newCursor, number] = readNumber(string, i);
        }
      }
      if (position === 2 || position === 5 || position === 6) {
        [newCursor, number] = readNumber(string, i);
      }
      if (position === 3 || position === 4) {
        // read flags
        if (c === '0') {
          number = 0;
        }
        if (c === '1') {
          number = 1;
        }
      }
    } else {
      [newCursor, number] = readNumber(string, i);
    }
    if (number == null) {
      return pathData;
    }
    args.push(number);
    canHaveComma = true;
    hadComma = false;
    i = newCursor;
    // flush arguments when necessary count is reached
    if (args.length === argsCount) {
      pathData.push({ command, args });
      // subsequent moveto coordinates are treated as implicit lineto commands
      if (command === 'M') {
        command = 'L';
      }
      if (command === 'm') {
        command = 'l';
      }
      args = [];
    }
  }
  return pathData;
};

/**
 * @param {number} number
 * @param {number=} precision
 * @returns {{ roundedStr: string, rounded: number }}
 */
const roundAndStringify = (number, precision) => {
  if (precision != null) {
    number = toFixed(number, precision);
  }

  return {
    roundedStr: removeLeadingZero(number),
    rounded: number,
  };
};

/**
 * Elliptical arc large-arc and sweep flags are rendered with spaces
 * because many non-browser environments are not able to parse such paths
 *
 * @param {string} command
 * @param {ReadonlyArray<number>} args
 * @param {number=} precision
 * @param {boolean=} disableSpaceAfterFlags
 * @returns {string}
 */
const stringifyArgs = (command, args, precision, disableSpaceAfterFlags) => {
  let result = '';
  let previous;

  for (let i = 0; i < args.length; i++) {
    const { roundedStr, rounded } = roundAndStringify(args[i], precision);
    if (
      disableSpaceAfterFlags &&
      (command === 'A' || command === 'a') &&
      // consider combined arcs
      (i % 7 === 4 || i % 7 === 5)
    ) {
      result += roundedStr;
    } else if (i === 0 || rounded < 0) {
      // avoid space before first and negative numbers
      result += roundedStr;
    } else if (!Number.isInteger(previous) && !isDigit(roundedStr[0])) {
      // remove space before decimal with zero whole
      // only when previous number is also decimal
      result += roundedStr;
    } else {
      result += ` ${roundedStr}`;
    }
    previous = rounded;
  }

  return result;
};

/**
 * @param {StringifyPathDataOptions} options
 * @returns {string}
 */
export const stringifyPathData = ({
  pathData,
  precision,
  disableSpaceAfterFlags,
}) => {
  if (pathData.length === 1) {
    const { command, args } = pathData[0];
    return (
      command + stringifyArgs(command, args, precision, disableSpaceAfterFlags)
    );
  }

  let result = '';
  let prev = { ...pathData[0] };

  // match leading moveto with following lineto
  if (pathData[1].command === 'L') {
    prev.command = 'M';
  } else if (pathData[1].command === 'l') {
    prev.command = 'm';
  }

  for (let i = 1; i < pathData.length; i++) {
    const { command, args } = pathData[i];
    if (
      (prev.command === command &&
        prev.command !== 'M' &&
        prev.command !== 'm') ||
      // combine matching moveto and lineto sequences
      (prev.command === 'M' && command === 'L') ||
      (prev.command === 'm' && command === 'l')
    ) {
      prev.args = [...prev.args, ...args];
      if (i === pathData.length - 1) {
        result +=
          prev.command +
          stringifyArgs(
            prev.command,
            prev.args,
            precision,
            disableSpaceAfterFlags,
          );
      }
    } else {
      result +=
        prev.command +
        stringifyArgs(
          prev.command,
          prev.args,
          precision,
          disableSpaceAfterFlags,
        );

      if (i === pathData.length - 1) {
        result +=
          command +
          stringifyArgs(command, args, precision, disableSpaceAfterFlags);
      } else {
        prev = { command, args };
      }
    }
  }

  return result;
};
