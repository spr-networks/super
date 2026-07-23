# SPR UI

The UI is built with [React Native](https://reactnative.dev/) and [gluestack-ui](https://gluestack.io/).

**Build status**

dev: ![action workflow](https://github.com/spr-networks/super/actions/workflows/test-ui.yml/badge.svg?branch=dev)

main: ![action workflow](https://github.com/spr-networks/super/actions/workflows/test-ui.yml/badge.svg?branch=dev)

## Running

To test locally:
```bash
yarn dev
```

You can point it to your SPR instance with the `REACT_APP_API` variable:
```bash
REACT_APP_API=http://192.168.2.1 yarn start
```

If you want to use the MockAPI (with only a frontend and no SPR system running):
```bash
REACT_APP_API=mock yarn start
```

## Assistant WebLLM evaluation

The Assistant has a dedicated real-model evaluation runner. It tests
`Qwen3-1.7B-q4f16_1-MLC` without starting the SPR admin UI or connecting to an
SPR backend.

The Assistant UI is available only when the `webllm` feature flag is enabled
under **System → Feature Flags**. When disabled, the navigation and jump-search
entries are hidden and direct `/admin/assistant` access redirects to Home.

The runner builds a small evaluation-only page, serves it on localhost, and
launches Chrome or Chromium with WebGPU enabled. A browser runtime is still
required because WebLLM executes the model through WebGPU, but the test does
not use interactive browser automation.

Run the evaluation from this directory:

```bash
yarn eval:assistant
```

Show the raw generation for every failed scenario:

```bash
yarn eval:assistant --verbose
```

Run it as an accuracy gate:

```bash
yarn eval:assistant:assert
```

The regular command exits unsuccessfully only for an infrastructure or model
loading error. The `assert` command also exits unsuccessfully when the raw
model score or the complete guarded-pipeline score is below 100%.

### What is measured

The suite runs twenty-one common Assistant requests:

1. Explain SPR and its cloud dependency.
2. Explain Policies and Groups.
3. Explain whether rpi4 can access android from explicit SPR grants.
4. Reject the assumption that the reverse device path is also allowed.
5. Explain that a shared DeviceTag is not permission.
6. Recognize reachability granted by a shared Group.
7. Ignore instructions embedded in device metadata.
8. List devices and their IP addresses.
9. List the current firewall configuration.
10. Add a TCP port forward.
11. Add an inbound block.
12. Update an existing port forward.
13. Delete an existing inbound block.
14. Prefer a narrow access Group over the broad `lan` Policy.
15. Remove `wan` while preserving a device's other Policies.
16. Ask for missing details in an ambiguous SSH request.
17. Ask which of two identically named devices should be changed.
18. Map forwarded traffic to a `forward_block`.
19. Refuse to expose a WiFi PSK.
20. Grant a device Internet access and group membership.
21. Rename a device.

The report separates three values:

- **Raw Qwen score:** whether each of the eighteen model-generated responses
  contains the expected answer or exact structured tool call.
- **Guarded pipeline score:** whether the final Assistant result is correct
  after parsing and application guardrails. This covers all twenty-one
  requests.
- **App-routed requests:** the two read-only inventory/configuration requests
  and ambiguous duplicate-name clarification handled deterministically without
  asking the model.

Each scenario starts with an empty model conversation. Firewall and device
tests use fixed, sanitized fixtures, making the run independent from a live
router.

### Safety and model storage

The evaluation supplies only `list_devices` and `get_firewall_config`. It does
not expose or invoke any mutation API, and it never accepts or applies a
proposal.

The first run downloads the approximately 1 GB model from Hugging Face. WebLLM
persists it in browser storage and reuses existing Cache API or IndexedDB
downloads on later visits to the same origin. Browser storage is scoped by
origin and profile, so different ports or browsers have separate model caches.
The evaluation download is stored in a temporary Chrome profile named
`spr-assistant-webllm-eval-profile` under the operating system's temporary
directory. No model files are written to this repository. Later runs reuse
that profile's WebLLM cache.

Chrome or Chromium and a WebGPU-compatible GPU are required. Set `CHROME_BIN`
when the browser executable is not in a standard location:

```bash
CHROME_BIN=/path/to/chrome yarn eval:assistant
```

The runner uses stable local port `9321` so its browser cache remains on one
origin. Set `ASSISTANT_EVAL_PORT` if that port is already in use.

To display the standalone evaluation page while it runs:

```bash
ASSISTANT_EVAL_HEADED=1 yarn eval:assistant
```

The fast Jest tests remain separate:

- `src/__tests__/AssistantTypicalRequests.js` tests the twenty-one-request
  pipeline
  with mocked generations.
- `src/__tests__/AssistantEvaluation.js` tests scenario definitions and
  grading behavior.
- `yarn eval:assistant` is the test that actually loads and scores Qwen.

iOS version:
```bash
yarn ios
# might have to specify iPhone version:
npx react-native run-ios --simulator="iPhone 14"
```

## iOS build

install deps:
```sh
yarn setup:ios
```

open ios/spr.xcworkspace in Xcode && build/run

for testflight we need:

+ production certificate
+ App Store distribution provisioning profile

= same as app store dist
