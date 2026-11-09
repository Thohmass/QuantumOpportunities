// Lab switch for experiments (now: the map lens). Off for everyone until the site is opened with "?lab" in the
// address; remembered in this browser, and "?nolab" turns it off again. Read once at start-up, before the app
// rewrites the address from its own state (which drops unknown parameters such as these).
export const LAB: boolean = (() => {
  try {
    if (/[?&]nolab\b/.test(location.hash)) localStorage.removeItem('qo-lab');
    else if (/[?&]lab\b/.test(location.hash)) localStorage.setItem('qo-lab', '1');
    return localStorage.getItem('qo-lab') === '1';
  } catch {
    return false;
  }
})();
