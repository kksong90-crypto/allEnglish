# WebKit 2215: repeated reload after pushState

Playwright 1.56.1 / bundled WebKit 2215 aborts on a second reload of a history entry created with `history.pushState`. The renderer reports a C++ `optional<unsigned long>::_M_get()` / `_M_is_engaged()` assertion. This also occurs with the previous application baseline, and with a single HTML page containing only a `pushState` call: no application, IndexedDB, CSS, API, authentication, or route interception is required. A plain HTML control passes repeated reloads. Moving the call to a later task or running it after the initial load does not prevent the failure.

This is a reproducible limitation of the pinned test engine. It does **not** establish a Safari production bug or show that the application caused the native assertion. The application's history/back handling remains unchanged.

## Minimal reproduction

With the repository's browser-test dependencies and matching browser installed, run from `browser-tests`:

```sh
node --input-type=module <<'JS'
import {createServer} from 'node:http';
import {webkit} from 'playwright';
const server=createServer((_,res)=>{
  res.writeHead(200,{'Content-Type':'text/html'});
  res.end(`<!doctype html><p>synthetic</p><script>
    if (!history.state) history.pushState({guard:true},'',location.href);
  </script>`);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await webkit.launch({headless:true});
try {
  const page=await browser.newPage();
  await page.goto('http://127.0.0.1:'+server.address().port);
  for(let i=1;i<=3;i++){await page.reload();console.log('reload',i);}
} finally {
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
JS
```

Expected on the affected engine: the first reload completes and the second reports `Page crashed`. Removing the `script` produces a passing control. The same failure was independently reproduced against application baseline `c4572e2`. Initial prepared-test CI evidence: run `44460556095`.

## Regression coverage

`prepared-practice.browser.mjs` retains the actual first reload and verifies that IndexedDB content survives it: the fresh manifest is requested again while the words endpoint is not. The complete 55-write GC workload, content/count bounds, expiry checks, corruption recovery, account separation and simultaneous-click checks remain intact.

The nonpilot capability test is an independent account/feature scenario. It closes the earlier page and opens a fresh page in the **same browser context and origin**; storage remains available. It still verifies a fresh home response, zero additional manifest requests, and all 205 words from the existing ALL endpoint. No exception is caught, no timeout is increased, and no test is skipped. This separates the feature scenario from the pinned engine's second-reload failure and also exercises closing and reopening the app.
