'use strict';

/**
 * @typedef {import('css-tree').CssNode} CssNode
 * @typedef {import('../lib/types').XastText} XastText
 */

const csstree = require('css-tree');
const opentype = require('opentype.js');

const { collectStylesheet, computeStyle } = require('../lib/style');

exports.name = 'optimizeInlineFonts';
exports.description = 'remove unused glyphs from inline fonts';

/**
 * @see https://developer.mozilla.org/en-US/docs/Web/CSS/font-family#values
 */
const genericFontFamilies = [
  'serif',
  'sans-serif',
  'monospace',
  'cursive',
  'fantasy',
  'system-ui',
  'ui-serif',
  'ui-sans-serif',
  'ui-monospace',
  'ui-rounded',
  'math',
  'emoji',
  'fangsong'
];

/**
 * @type {import('./plugins-types').Plugin<'optimizeInlineFonts'>}
 */
exports.fn = (root) => {

  const stylesheet = collectStylesheet(root);

  /**
   * Set of all font-families used in the document.
   *
   * @type {Set<string>}
   */
  const fonts = new Set();

  /**
   * Store all glyphs so we don't mess up ligatures.
   *
   * @type {Set<string>}
   */
  const text = new Set();

  /**
   * @type {XastText}
   */
  let styleText;

  /**
   * @type {CssNode}
   */
  let styles;

  return {
    text: {
      enter: (node, parentNode) => {
        if (
          styles == null &&
          parentNode.type === 'element' &&
          parentNode.name === 'style'
        ) {
          styleText = node;
          styles = csstree.parse(node.value, {
            context: 'stylesheet'
          });
          return;
        }

        text.add(node.value);
      }
    },

    element: {
      enter: (node) => {
        const styles = computeStyle(stylesheet, node);
        const fontFamilyStyle = styles['font-family'];

        if (fontFamilyStyle == null || fontFamilyStyle.type === 'dynamic') {
          return;
        }

        const fontFamilies = fontFamilyStyle.value;
        const parsed = csstree.parse(fontFamilies, {
          context: 'value'
        });

        const fontFamilyNames = csstree.findAll(parsed, (node) => node.type === 'String');

        for (const fontFamily of fontFamilyNames) {
          if (fontFamily.type === 'String' && !genericFontFamilies.includes(fontFamily.value)) {
            fonts.add(fontFamily.value);
          }
        }
      },
    },

    root: {
      exit: () => {
        if (styles == null || styles.type !== 'StyleSheet') {
          return;
        }

        for (const fontName of fonts) {
          const fontNode = csstree.find(styles, (node) => {
            return node.type === 'Url' && node.value.startsWith('data:font/truetype;charset=utf-8;base64,');
          });

          if (fontNode == null || fontNode.type !== 'Url') {
            continue;
          }

          const fontData = fontNode.value.split('base64,')[1];
          const font = opentype.parse(Buffer.from(fontData, 'base64').buffer);

          const glyphs = new Set();

          for (let char of [...text].join('')) {
            if (char === ' ') {
              char = 'space';
            }

            glyphs.add(font.charToGlyph(char));
          }

          const newFont = new opentype.Font({
            familyName: fontName,
            styleName: 'Optimized',
            unitsPerEm: font.unitsPerEm,
            ascender: font.ascender,
            descender: font.descender,
            glyphs: [...glyphs]
          });

          const newFontData = Buffer.from(newFont.toArrayBuffer()).toString('base64');
          fontNode.value = `data:font/truetype;charset=utf-8;base64,${newFontData}`;
        }

        styleText.value = csstree.generate(styles);
      }
    }
  }
}
