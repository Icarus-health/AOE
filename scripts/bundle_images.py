#!/usr/bin/env python3
"""
Recursively walk through an image directory, concatenate every PNG into a
single ``gfx.bin`` blob and emit a companion ``gfx.json`` index describing
the byte layout of each source file. This is the exact format expected by
``src/sprites.js`` — the runtime fetches both files and slices the blob to
create ImageBitmaps without any additional per-file HTTP requests.

Python 3 rewrite of the original Python 2 script (``file()`` → ``open()``).
"""
import argparse
import json
import os


def bundle(input_dir: str, out_bin: str, out_json: str, ext: str = 'png',
           strip_prefix: str = '') -> None:
    data = []
    offset = 0

    os.makedirs(os.path.dirname(os.path.abspath(out_bin)) or '.', exist_ok=True)
    norm_strip = os.path.normpath(strip_prefix) + os.sep if strip_prefix else ''

    with open(out_bin, 'wb') as out:
        def push_file(path: str) -> None:
            nonlocal offset
            with open(path, 'rb') as img:
                buf = img.read()
            out.write(buf)
            size = len(buf)
            key = path.replace('__glued.png', '')
            # Drop the configured strip prefix so the JSON keys match the
            # paths used by sprite calls in src/ (e.g. "img/trees/stump.png").
            if norm_strip and key.startswith(norm_strip):
                key = key[len(norm_strip):]
            data.append([key, size])
            offset += size

        for root, _dirs, files in os.walk(input_dir):
            if '__glued.png' in files:
                push_file(os.path.join(root, '__glued.png'))
            else:
                for name in sorted(files):
                    if name.endswith('.' + ext):
                        push_file(os.path.join(root, name))

    with open(out_json, 'w') as out:
        # Normalise Windows-style separators and drop needless whitespace
        # to keep the index compact.
        out.write(
            json.dumps(data, separators=(',', ':')).replace('\\\\', '/')
        )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('input', default='public/img', nargs='?')
    parser.add_argument('out_bin', default='public/gfx.bin', nargs='?', type=str)
    parser.add_argument('out_json', default='public/gfx.json', nargs='?', type=str)
    parser.add_argument('-e', '--ext', default='png', type=str)
    parser.add_argument('--strip-prefix', default='public/', type=str,
                        help='Path prefix to strip from JSON keys (default: public/)')
    args = parser.parse_args()

    bundle(args.input, args.out_bin, args.out_json, args.ext, args.strip_prefix)
    print(f'[bundle_images] wrote {args.out_bin} and {args.out_json}')


if __name__ == '__main__':
    main()
