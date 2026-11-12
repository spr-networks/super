# Vendored LFM3 WebGPU runtime

`Lfm3ForCausalLM.js` is the self-contained WebGPU inference library from the
[webml-community/LFM3-1.7B-WebGPU-Pi](https://huggingface.co/spaces/webml-community/LFM3-1.7B-WebGPU-Pi)
Hugging Face Space. The Assistant uses it to run the
[LiquidAI/LFM3-1.7B-GGUF](https://huggingface.co/LiquidAI/LFM3-1.7B-GGUF)
weights in the browser. Only the model library is vendored; the Space's
workspace interface and agent are not used.

| | |
| --- | --- |
| Source | `dist/runtime/Lfm3ForCausalLM.js` |
| Space commit | `3ad7ce876d3272d4b3496ad7dd06da5e7e334f2c` |
| Git blob | `b7103b87ac75fd7536da4564861bee7d43de6698` |
| SHA-256 (upstream file) | `c6bb4050173e157b172161306c73515472551512a76025cf123d29d45e515c55` |
| License | Apache-2.0 (`LICENSE`) |

Local changes are the leading `/* eslint-disable */` line and one response-only
observability addition: the completed session result includes `raw_text`, decoded
from the same generated token IDs with special tokens preserved. The frontend
uses this to reject malformed native calls before dispatch. Token generation,
model weights and numerical kernels are unchanged.

`local-patch.json` records the exact one-occurrence source replacement and full
before/after SHA-256 hashes. The patched full-file SHA-256 is
`fa875473a26d559ec5c61664d1c9a8d24d99b309b60f8266236914908cbfc3c5`. Reverse that replacement and remove the
leading local header to reproduce the upstream file hash above.

The library bundles Hugging Face tokenization (Apache-2.0,
`licenses/tokenizers-LICENSE`) and Jinja templating (MIT,
`licenses/jinja-LICENSE`).

Model weights are not part of this repository. Browsers download them from
Hugging Face on first use, and they remain subject to the
[LFM Open License v1.0](https://huggingface.co/LiquidAI/LFM3-1.7B-GGUF/blob/main/LICENSE).
