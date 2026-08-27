import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

/**
 * `useAnimatedStyle` callbacks run on the UI thread every frame the shared
 * values they read are in motion. Returning a layout property from one -
 * `left`, `top`, `width`, `height`, any `margin*`/`padding*` - forces a Yoga
 * relayout on every one of those frames, because Fabric cannot distinguish
 * "layout changed" from "purely visual property changed" the way it can for
 * `transform` and `opacity`, which are compositor-only.
 *
 * That is not a style guideline - it produced a real, unrecoverable ANR on
 * device. `src/features/title/hero.tsx` animated `left/top/width/height` for
 * the shared-element transition; when the JS-side unmount timer fired before
 * a spring had actually settled, the native scheduler was left driving
 * relayout against a node that no longer existed. The main thread pegged,
 * the JS thread stayed completely asleep and unaware anything was wrong (no
 * component tree, no state loop, nothing a React error boundary could ever
 * see), and Android eventually killed the process. See git history on that
 * file and on src/ui/Indicators.tsx (the ProgressBar had the same issue with
 * `width`) for the transform-based fix.
 *
 * This scans every `useAnimatedStyle` call in the app for a returned layout
 * property, so a future one lands here instead of on a phone.
 */

const SOURCE_ROOTS = ['app', 'src'];
const LAYOUT_PROPS = [
  'left',
  'right',
  'top',
  'bottom',
  'width',
  'height',
  'minWidth',
  'minHeight',
  'maxWidth',
  'maxHeight',
  'margin',
  'marginTop',
  'marginBottom',
  'marginLeft',
  'marginRight',
  'marginHorizontal',
  'marginVertical',
  'padding',
  'paddingTop',
  'paddingBottom',
  'paddingLeft',
  'paddingRight',
  'paddingHorizontal',
  'paddingVertical',
  'flexBasis',
];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

/** Extracts every `useAnimatedStyle(...)` call body via balanced-paren scanning. */
function extractAnimatedStyleBodies(source: string): string[] {
  const bodies: string[] = [];
  const marker = 'useAnimatedStyle(';
  let searchFrom = 0;

  while (true) {
    const start = source.indexOf(marker, searchFrom);
    if (start === -1) break;

    let depth = 0;
    let end = start + marker.length - 1;
    for (let index = end; index < source.length; index += 1) {
      if (source[index] === '(') depth += 1;
      else if (source[index] === ')') {
        depth -= 1;
        if (depth === 0) {
          end = index;
          break;
        }
      }
    }

    bodies.push(source.slice(start, end + 1));
    searchFrom = end + 1;
  }

  return bodies;
}

describe('useAnimatedStyle never returns a layout property', () => {
  const files = SOURCE_ROOTS.flatMap((root) => walk(join(process.cwd(), root)));

  it('finds the source files it is meant to scan', () => {
    expect(files.length).toBeGreaterThan(40);
  });

  it('has no offending property in any useAnimatedStyle body', () => {
    const offenders: string[] = [];
    const propertyPattern = new RegExp(
      '\\b(' + LAYOUT_PROPS.join('|') + ')\\s*:',
    );

    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const body of extractAnimatedStyleBodies(source)) {
        const match = body.match(propertyPattern);
        if (match) {
          const line = source.slice(0, source.indexOf(body)).split('\n').length;
          offenders.push(
            file.replace(process.cwd(), '') +
              ':~' +
              line +
              '  returns "' +
              match[1] +
              '" - animate transform/opacity instead, or animate width via transform: scaleX',
          );
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
