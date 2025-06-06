import { attrsGroupsDefaults, colorsProps } from './_collections.js';
import {
  detachNodeFromParent,
  querySelector,
  querySelectorAll,
} from '../lib/xast.js';
import { collectStylesheet, computeStyle } from '../lib/style.js';

export const name = 'convertOneStopGradients';
export const description =
  'converts one-stop (single color) gradients to a plain color';

/**
 * Converts one-stop (single color) gradients to a plain color.
 *
 * @author Seth Falco <seth@falco.fun>
 * @type {import('../lib/types.js').Plugin}
 * @see https://developer.mozilla.org/docs/Web/SVG/Element/linearGradient
 * @see https://developer.mozilla.org/docs/Web/SVG/Element/radialGradient
 */
export const fn = (root) => {
  const stylesheet = collectStylesheet(root);

  /**
   * Parent defs that had gradients elements removed from them.
   *
   * @type {Set<import('../lib/types.js').XastElement>}
   */
  const effectedDefs = new Set();

  /** @type {Map<import('../lib/types.js').XastElement, import('../lib/types.js').XastParent>} */
  const allDefs = new Map();

  /** @type {Map<import('../lib/types.js').XastElement, import('../lib/types.js').XastParent>} */
  const gradientsToDetach = new Map();

  /** Number of references to the xlink:href attribute. */
  let xlinkHrefCount = 0;

  return {
    element: {
      enter: (node, parentNode) => {
        if (node.attributes['xlink:href'] != null) {
          xlinkHrefCount++;
        }

        if (node.name === 'defs') {
          allDefs.set(node, parentNode);
          return;
        }

        if (node.name !== 'linearGradient' && node.name !== 'radialGradient') {
          return;
        }

        const stops = node.children.filter((child) => {
          return child.type === 'element' && child.name === 'stop';
        });

        const href = node.attributes['xlink:href'] || node.attributes['href'];
        const effectiveNode =
          stops.length === 0 && href != null && href.startsWith('#')
            ? querySelector(root, href)
            : node;

        if (effectiveNode == null || effectiveNode.type !== 'element') {
          gradientsToDetach.set(node, parentNode);
          return;
        }

        const effectiveStops = effectiveNode.children.filter((child) => {
          return child.type === 'element' && child.name === 'stop';
        });

        if (
          effectiveStops.length !== 1 ||
          effectiveStops[0].type !== 'element'
        ) {
          return;
        }

        if (parentNode.type === 'element' && parentNode.name === 'defs') {
          effectedDefs.add(parentNode);
        }

        gradientsToDetach.set(node, parentNode);

        let color;
        const style = computeStyle(stylesheet, effectiveStops[0])['stop-color'];
        if (style != null && style.type === 'static') {
          color = style.value;
        }

        const selectorVal = `url(#${node.attributes.id})`;

        const selector = [...colorsProps]
          .map((attr) => `[${attr}="${selectorVal}"]`)
          .join(',');
        const elements = querySelectorAll(root, selector);
        for (const element of elements) {
          if (element.type !== 'element') {
            continue;
          }

          for (const attr of colorsProps) {
            if (element.attributes[attr] !== selectorVal) {
              continue;
            }

            if (color != null) {
              element.attributes[attr] = color;
            } else {
              delete element.attributes[attr];
            }
          }
        }

        const styledElements = querySelectorAll(
          root,
          `[style*=${selectorVal}]`,
        );
        for (const element of styledElements) {
          if (element.type !== 'element') {
            continue;
          }

          element.attributes.style = element.attributes.style.replace(
            selectorVal,
            color || attrsGroupsDefaults.presentation['stop-color'],
          );
        }
      },

      exit: (node) => {
        if (node.name === 'svg') {
          for (const [gradient, parent] of gradientsToDetach.entries()) {
            if (gradient.attributes['xlink:href'] != null) {
              xlinkHrefCount--;
            }

            detachNodeFromParent(gradient, parent);
          }

          if (xlinkHrefCount === 0) {
            delete node.attributes['xmlns:xlink'];
          }

          for (const [defs, parent] of allDefs.entries()) {
            if (effectedDefs.has(defs) && defs.children.length === 0) {
              detachNodeFromParent(defs, parent);
            }
          }
        }
      },
    },
  };
};
