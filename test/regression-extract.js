'use strict';

const fs = require('fs');
const path = require('path');
const util = require('util');
const zlib = require('zlib');
const stream = require('stream');
const { default: fetch } = require('node-fetch');
const tarStream = require('tar-stream');

const pipeline = util.promisify(stream.pipeline);

/**
 * Files to skip regression testing for due to parsing issues.
 */
const exclude = [
  // parser doesn't work with this
  'svgs/oxygen-icons-5.113.0/scalable/apps/kalarm.svg',
  // animated
  'w3c-svg-11-test-suite/svg/filters-light-04-f.svg',
  'svgs/W3C_SVG_11_TestSuite/svg/filters-composite-05-f.svg',
  // messed gradients
  'svgs/W3C_SVG_11_TestSuite/svg/pservers-grad-18-b.svg',
  // removing wrapping <g> breaks :first-child pseudo-class
  'svgs/W3C_SVG_11_TestSuite/svg/styling-pres-04-f.svg',
  // rect is converted to path which matches wrong styles
  'svgs/W3C_SVG_11_TestSuite/svg/styling-css-08-f.svg',
  // complex selectors are messed because of converting shapes to paths
  'svgs/W3C_SVG_11_TestSuite/svg/struct-use-10-f.svg',
  'svgs/W3C_SVG_11_TestSuite/svg/struct-use-11-f.svg',
  'svgs/W3C_SVG_11_TestSuite/svg/styling-css-01-b.svg',
  'svgs/W3C_SVG_11_TestSuite/svg/styling-css-04-f.svg',
  // strange artifact breaks inconsistently  breaks regression tests
  'svgs/W3C_SVG_11_TestSuite/svg/filters-conv-05-f.svg',
];

/**
 * @param {string} url
 * @param {string} baseDir
 */
const extractTarGz = async (url, baseDir) => {
  const extract = tarStream.extract();
  extract.on('entry', async (header, stream, next) => {
    const name = header.name;

    try {
      if (
        name.endsWith('.svg') &&
        !exclude.includes(name) &&
        !name.startsWith('svgs/W3C_SVG_11_TestSuite/svg/animate-')
      ) {
        const file = path.join(baseDir, header.name);
        await fs.promises.mkdir(path.dirname(file), { recursive: true });
        await pipeline(stream, fs.createWriteStream(file));
      }
    } catch (error) {
      console.error(error);
      process.exit(1);
    }
    stream.resume();
    next();
  });
  const response = await fetch(url);
  await pipeline(response.body, zlib.createGunzip(), extract);
};

(async () => {
  try {
    console.info('Download SVGO Test Suite and extracting SVG files');
    await extractTarGz(
      'https://sethfalco.github.io/svgo-test-suite/svgo-test-suite.tar.gz',
      path.join(__dirname, 'regression-fixtures'),
    );
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
})();
