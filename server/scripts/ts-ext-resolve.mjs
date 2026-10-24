// Minimal ESM resolve hook: TypeScript source in this project imports relative
// modules without an extension (resolved by tsc/tsx's moduleResolution at build
// time). Plain Node ESM requires an explicit extension, so this hook retries an
// extensionless relative specifier with .ts appended before giving up. Lets us run
// the project's .ts files directly with `node --experimental-strip-types` and no
// npm install (blocked in this sandbox) — used only for local report rendering.
export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    if ((specifier.startsWith("./") || specifier.startsWith("../")) && !specifier.match(/\.[a-zA-Z0-9]+$/)) {
      return nextResolve(`${specifier}.ts`, context);
    }
    throw err;
  }
}
