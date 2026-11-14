// C11 quant parameters, shared by the WASM and native adapters.
/** C11 parameters are optional: fetched once (`/data/quant_params.json`), literature defaults inside the engine if absent. */
let quantParams: Promise<unknown> | null = null;
export function loadQuantParams(): Promise<unknown> {
  if (!quantParams) {
    quantParams = (async () => {
      try {
        const res = await fetch("/data/quant_params.json");
        if (!res.ok) return undefined;
        return await res.json();
      } catch {
        return undefined;
      }
    })();
  }
  return quantParams;
}

