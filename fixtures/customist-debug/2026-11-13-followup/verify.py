"""Check immutable capture evidence; does not qualify files for knitting."""
import base64
import copy
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def decompress_base64(value):
    """Read the LZ-string base64 wrapper used by Customist cstack arrays."""
    alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/='
    values = [alphabet.index(c) for c in value]
    pos, mask = 0, 32

    def bits(count):
        nonlocal pos, mask
        result = 0
        for i in range(count):
            result |= bool(values[pos] & mask) << i
            mask >>= 1
            if not mask:
                mask = 32
                pos += 1
        return result

    code = bits(2)
    if code == 2:
        return ''
    char = chr(bits(8 if code == 0 else 16))
    dictionary, size, enlarge, width = {3: char}, 4, 4, 3
    previous, result = char, [char]
    while True:
        code = bits(width)
        if code in (0, 1):
            dictionary[size] = chr(bits(8 if code == 0 else 16))
            code, size, enlarge = size, size + 1, enlarge - 1
        elif code == 2:
            return ''.join(result)
        if enlarge == 0:
            enlarge, width = 1 << width, width + 1
        if code in dictionary:
            entry = dictionary[code]
        elif code == size:
            entry = previous + previous[0]
        else:
            raise ValueError('Invalid compressed cstack string')
        result.append(entry)
        dictionary[size] = previous + entry[0]
        size, enlarge, previous = size + 1, enlarge - 1, entry
        if enlarge == 0:
            enlarge, width = 1 << width, width + 1


def expand(value):
    if isinstance(value, str) and value.startswith('$lz:'):
        return expand(decompress_base64(value[4:]))
    if isinstance(value, list):
        return [expand(v) for v in value]
    if isinstance(value, dict):
        return {k: expand(v) for k, v in value.items()}
    return value


def normalize(commands):
    result = expand(copy.deepcopy(commands))
    for command in result:
        command.pop('uuid', None)
        command['parameters'].pop('canvasId', None)
    return result


def instructions(path):
    lines = path.read_bytes().splitlines(keepends=True)
    assert lines[2].startswith(b'// ') and lines[2].rstrip().endswith(b'.kc')
    return b''.join(lines[:2] + lines[3:])


def main():
    manifest = json.loads((ROOT / 'manifest.json').read_text())
    for item in manifest['artifacts']:
        data = (ROOT / item['file']).read_bytes()
        assert len(data) == item['bytes'], item['file']
        assert hashlib.sha256(data).hexdigest() == item['sha256'], item['file']
    cases = {c['id']: c for c in manifest['captures']}
    assert len(cases) == 21
    reports = {}
    for name, case in cases.items():
        report = json.loads((ROOT / case['decoded']).read_text())
        assert report['passCount'] == len(report['passes']) == case['machinePasses']
        assert report['kcodeSha256'] == case['sha256']
        reports[name] = report['passes']
        stack = json.loads((ROOT / case['sourceStack']).read_text())
        commands = [c for c in stack['commands']
                    if c['parameters'].get('canvasId') == case['canvasId']]
        authored = json.loads((ROOT / case['input']).read_text())['commands']
        assert normalize(commands) == normalize(authored), name
        # Sparse raster length is the number of edits, not the canvas height.
        for c in expand(authored):
            for op in c['parameters'].get('rasterOps', []):
                op = op.get('odata', op)
                if 'indices' in op:
                    assert len(base64.b64decode(op['indices'][5:])) // 4 == op['length']
                    assert len(base64.b64decode(op['pixels'][4:])) == op['length']

    def program(name):
        return instructions(ROOT / cases[name]['file'])

    assert program('singlebed-reversable') == instructions(
        ROOT.parent / '2026-11-13/raw/right-phase0-control.kc')
    assert program('rib-full-reversable') == program('rib-full-control')
    assert program('top-waste-on') == program('top-waste-off')
    assert program('fashioned-width2') != instructions(
        ROOT.parent / '2026-11-13/raw/right-phase0-fashioned.kc')
    for i, p in enumerate(reports['rib-full-control']):
        assert p['actions']['knit front'] == (11 if i < 8 else 12)
        assert p['actions']['knit rear'] == (11 if i < 16 else 12)
    for i, p in enumerate(reports['both-edges-full-control']):
        assert p['actions']['knit front'] == 20 + 2 * (i // 8)
    for style, split_passes in [('simple', [8, 24]), ('fashioned', [8, 28])]:
        ps = reports[f'both-edges-full-{style}']
        events = [p for p in ps if 'split front>rear' in p['actions']]
        assert [p['pass'] for p in events] == split_passes
        assert all(p['actions']['split front>rear'] == 2 for p in events)
    for name in ['jacquard-simple', 'rib-full-simple']:
        assert sum(p['actions'].get('split front>rear', 0) for p in reports[name]) == 2
    for side in ['left', 'right']:
        ps = reports[f'decrease-{side}-control']
        assert [p['actions']['knit front'] for p in ps] == [24]*8 + [23]*8 + [22]*8
        for style in ['simple', 'fashioned']:
            assert program(f'decrease-{side}-{style}') != program(f'decrease-{side}-control')
    ps = reports['decrease-jacquard-control']
    body = [p for p in ps[24:96] if p['carrier'] in ('3', '4')]
    assert len(body) == 48
    assert [sum(p['actions'].get(k, 0) for k in ('knit front', 'knit rear'))
            for p in body] == [24]*16 + [23]*16 + [22]*16
    for style in ['simple', 'fashioned', 'reversable']:
        assert program('decrease-jacquard-' + style) != program('decrease-jacquard-control')
    ps = reports['top-waste-on']
    top = ps[144:152]
    assert len(top) == 8 and all(p['carrier'] == '6' and p['actions'] == {'knit front': 24} for p in top)
    assert all(not any(k.startswith('knit') for k in p['actions']) for p in ps[152:])
    print(f"Verified {len(manifest['artifacts'])} hashes and all 21 capture/source/decoder records.")
    print('Validated baseline geometry, refusal fallbacks, simultaneous splits, decreases, and C6 top return.')
    print('No physical knitting, controller acceptance, or topology qualification claimed.')


if __name__ == '__main__':
    main()
