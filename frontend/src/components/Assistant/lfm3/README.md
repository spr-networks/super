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

The only local change is a leading `/* eslint-disable */` line. Verify the
remaining bytes against the upstream blob with:

```bash
tail -n +2 Lfm3ForCausalLM.js | git hash-object --stdin
```

The library bundles Hugging Face tokenization (Apache-2.0,
`licenses/tokenizers-LICENSE`) and Jinja templating (MIT,
`licenses/jinja-LICENSE`).

Model weights are not part of this repository. Browsers download them from
Hugging Face on first use, and they remain subject to the
[LFM Open License v1.0](https://huggingface.co/LiquidAI/LFM3-1.7B-GGUF/blob/main/LICENSE).
