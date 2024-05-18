import jc.utils
import jc.parsers.universal
import re

class info():
    """Provides parser metadata (version, author, etc.)"""
    version = '1.0'
    description = 'iw reg get command parser'
    author = 'Your Name'
    author_email = 'your@email.com'
    details = 'Parse iw reg get output'
    compatible = ['linux', 'freebsd']
    magic_commands = ['iw reg get']
    tags = ['command']

__version__ = info.version

def _process(proc_data):
    """
    Final processing to conform to the schema.
    Parameters:
        proc_data:   (Dictionary) raw structured data to process
    Returns:
        Dictionary structured to conform to the schema.
    """
    return proc_data

def post_parse(data):
    cleandata = data
    return _process(cleandata)

def parse(data, raw=False, quiet=False):
    """
    Main text parsing function
    Parameters:
        data:        (string)  text data to parse
        raw:         (boolean) unprocessed output if True
        quiet:       (boolean) suppress warning messages if True
    Returns:
        Dictionary. Raw or processed structured data.
    """
    if not quiet:
        jc.utils.compatibility(__name__, info.compatible)

    raw_output = {
        "country": "",
        "dfs": None,
        "bands": []
    }

    for line in data.splitlines():
        if line.startswith("country"):
            if raw_output["country"] != "": break
            parts = line.split(":")
            raw_output["country"] = parts[0].split()[1]
            if len(parts) > 1:
                raw_output["dfs"] = parts[1].strip()
        elif line.strip().startswith("("):
            line = line.replace("(", "").replace(")", "")
            parts = line.split(",")
            band = {
                "start": int(parts[0].split("-")[0].strip()),
                "end": int(parts[0].split("-")[1].split("@")[0].strip()),
                "max_bandwidth": int(parts[0].split("@")[1].strip()),
                "max_antenna_gain": float(parts[1].strip()) if parts[1].strip() != "N/A" else None,
                "max_eirp": float(parts[2].strip()) if parts[2].strip() != "N/A" else None,
                "flags": [flag.strip() for flag in parts[3:]]
            }
            raw_output["bands"].append(band)

    return raw_output if raw else _process(raw_output)


