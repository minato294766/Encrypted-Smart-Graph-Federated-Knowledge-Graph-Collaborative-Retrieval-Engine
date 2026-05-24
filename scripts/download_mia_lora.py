"""
Download MiA-Emb-8B LoRA adapter weights from HuggingFace.

The base model (Qwen3-Embedding-8B) is already in pythonproject3.
This script downloads only the LoRA adapter from MindscapeRAG/MiA-Emb-8B.

Usage:
    python scripts/download_mia_lora.py
    python scripts/download_mia_lora.py --output D:/models/MiA-Emb-8B
"""

import argparse
import os
import sys

# Use hf-mirror for Chinese mainland access
os.environ.setdefault("HF_ENDPOINT", "https://hf-mirror.com")
os.environ.setdefault("HF_HUB_ENABLE_HF_TRANSFER", "0")


def download_lora_weights(output_dir: str):
    """Download MiA-Emb-8B LoRA adapter from HuggingFace.

    Downloads only the adapter weights (adapter_config.json + adapter_model.safetensors),
    not the full 15GB base model.
    """
    from huggingface_hub import snapshot_download

    print(f"Downloading MiA-Emb-8B LoRA adapter to: {output_dir}")
    print("  Using hf-mirror.com (no login required)")

    # Download only adapter files
    snapshot_download(
        repo_id="MindscapeRAG/MiA-Emb-8B",
        local_dir=output_dir,
        max_workers=2,
        # Only download adapter files, skip base model safetensors
        allow_patterns=[
            "adapter_config.json",
            "adapter_model.safetensors",
            "*.json",
            "*.txt",
        ],
        ignore_patterns=[
            "model-0000*-of-*.safetensors",
            "*.gguf",
            "*.bin",
        ],
    )

    print(f"\nDownload complete!")
    print(f"  LoRA adapter: {output_dir}")

    # Verify key files
    expected = ["adapter_config.json", "adapter_model.safetensors"]
    for f in expected:
        path = os.path.join(output_dir, f)
        if os.path.exists(path):
            size_mb = os.path.getsize(path) / (1024 * 1024)
            print(f"  ✓ {f} ({size_mb:.1f} MB)")
        else:
            print(f"  ✗ {f} NOT FOUND — download may be incomplete")


def main():
    parser = argparse.ArgumentParser(
        description="Download MiA-Emb-8B LoRA adapter weights"
    )
    parser.add_argument(
        "--output",
        default=None,
        help="Output directory (default: ../models/MiA-Emb-8B relative to this script)",
    )
    args = parser.parse_args()

    if args.output:
        output_dir = args.output
    else:
        script_dir = os.path.dirname(os.path.abspath(__file__))
        output_dir = os.path.join(script_dir, "..", "models", "MiA-Emb-8B")

    output_dir = os.path.abspath(output_dir)

    try:
        download_lora_weights(output_dir)
    except Exception as e:
        print(f"\nDownload failed: {e}")
        print("\nManual download steps:")
        print("  1. Visit https://huggingface.co/MindscapeRAG/MiA-Emb-8B")
        print("  2. Click 'Files and versions'")
        print("  3. Download adapter_config.json and adapter_model.safetensors")
        print(f"  4. Place them in: {output_dir}")
        sys.exit(1)


if __name__ == "__main__":
    main()
