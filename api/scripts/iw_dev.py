"""jc - JSON Convert `foo` command output parser

<<Short foo description and caveats>>

Usage (cli):

    $ iw list | jc --iw_dev

    or

    $ jc iw dev

Usage (module):

    import jc
    result = jc.parse('iw_dev', foo_command_output)

Schema:

    [
      {
        "foo":     string,
        "bar":     boolean,
        "baz":     integer
      }
    ]

Examples:

    $ iw list | jc --iw_dev -p
    []

    $ foo | jc --iw_dev -p -r
    []
"""
import jc.utils
import jc.parsers.universal
import re

class info():
    """Provides parser metadata (version, author, etc.)"""
    version = '1.0'
    description = 'iw dev command parser'
    author = 'spr'
    author_email = 'spr@supernetworks.org'
    details = 'parse iw dev output'

    compatible = ['linux', 'freebsd']
    magic_commands = ['iw dev']


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
    cleandata=data
    return _process(cleandata)

def parse(data, raw=False, quiet=False):
    """
    Main text parsing function

    Parameters:

        data:        (string)  text data to parse
        raw:         (boolean) unprocessed output if True
        quiet:       (boolean) suppress warning messages if True

    Returns:

        List of Dictionaries. Raw or processed structured data.
    """
    if not quiet:
        jc.utils.compatibility(__name__, info.compatible)
    #jc.utils.input_type_check(data)

    raw_output = {}
    section = {}
    phy = None
    kv_section = None
    kv_keys = None

    nicekey = lambda x: x.lower().replace(' ', '_').replace('-', '_').replace('#', '')

    iface = ""

    if jc.utils.has_data(data):

        for line in filter(None, data.splitlines()):
            if line.startswith('phy#'):
                if section:
                    raw_output[phy] = section
                    section = {}
                phy = nicekey(line)

                continue

            if line.strip().startswith('Interface'):
                iface = line.strip().split(' ')[1]
                section[iface] = {}
                continue

            if line.strip().startswith('multicast TXQ:'):
                kv_section = 'multicast_txq'
                continue

            if kv_section and 'qsz-byt' in line:
                kv_keys = list(map(nicekey, line.strip().split('\t')))
                continue

            if kv_keys and 'qsz-byt' not in line:
                kv_values = line.strip().split('\t')
                kv_values = filter(lambda x: len(x), kv_values)
                kv_values = map(int, kv_values)
                if iface != "":
                    section[iface][kv_section] = dict(zip(kv_keys, kv_values))
                kv_section = kv_keys = None
                continue

            if line.strip().find(' ') and iface != "" and iface in section:
                split_line = line.strip().split(' ')
                section[iface][split_line[0]] = ' '.join(split_line[1:])

                continue

    if section:
        raw_output[phy] = section

    return raw_output if raw else _process(raw_output)
