// Prints the CSS spring curves in app/ui/tokens.css from the same springs as app/ui/motion.ts,
// using Motion's own spring maths, so a CSS transition and a Motion animation feel the same.
// Run: node scripts/spring-css.mjs   (then paste the output over the block in tokens.css)
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const dom = require(require.resolve("motion-dom", { paths: [require.resolve("motion")] }));
const springs = { tap: [0.18, 0], snappy: [0.25, 0], smooth: [0.38, 0], settle: [0.45, 0.12], exit: [0.2, 0] };
for (const [name, [duration, bounce]] of Object.entries(springs)) {
  const options = { keyframes: [0, 100], stiffness: (2 * Math.PI / duration) ** 2, damping: (1 - bounce) * 4 * Math.PI / duration, mass: 1 };
  const generator = dom.spring(options);
  const ms = Math.min(dom.calcGeneratorDuration(generator), dom.maxGeneratorDuration);
  const easing = dom.generateLinearEasing(p => generator.next(p * ms).value / 100, ms, 15);
  console.log(`  --spring-${name}: ${easing};\n  --spring-${name}-ms: ${Math.round(ms)}ms;`);
}
