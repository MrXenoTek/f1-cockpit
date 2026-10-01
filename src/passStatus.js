// Did the car reach a spot before the flag came out, while it was out, or after the clear?
export const passStatus = (tZone, evt) => {
  if (tZone == null || !evt) return null;
  if (tZone < evt.t) return "before";
  if (evt.tClear && tZone > evt.tClear) return "after";
  return "yellow";
};
