"""jc - JSON Convert `foo` command output parser

<<Short foo description and caveats>>

Usage (cli):

    $ iw list | jc --iw_list

    or

    $ jc iw list

Usage (module):

    import jc
    result = jc.parse('iw_list', foo_command_output)

Schema:

    [
      {
        "foo":     string,
        "bar":     boolean,
        "baz":     integer
      }
    ]

Examples:

    $ iw list | jc --iw_list -p
    []

    $ foo | jc --iw_list -p -r
    []
"""
import jc.utils
import jc.parsers.universal
import re

class info():
    """Provides parser metadata (version, author, etc.)"""
    version = '1.0'
    description = 'iw list command parser'
    author = 'spr'
    author_email = 'spr@supernetworks.org'
    details = 'parse iw list output'

    compatible = ['linux', 'freebsd']
    magic_commands = ['iw list']


__version__ = info.version


def _process(proc_data):
    """
    Final processing to conform to the schema.

    Parameters:

        proc_data:   (List of Dictionaries) raw structured data to process

    Returns:

        List of Dictionaries. Structured to conform to the schema.
    """
    # convert ints and floats for top-level keys
    for item in proc_data:
        for key in item:
            try:
                item[key] = int(item[key])
            except (Exception):
                try:
                    item[key] = float(item[key])
                except (Exception):
                    pass
            # convert ints and floats for lists
            if isinstance(item[key], list):
                new_list = []
                for list_item in item[key]:
                    try:
                        new_list.append(int(list_item))
                    except (Exception):
                        try:
                            new_list.append(float(list_item))
                        except (Exception):
                            # list of strings
                            new_list = item[key]
                            pass
                item[key] = new_list

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

    raw_output: List = []
    section = {}
    subsection_key = None
    subsection = None

    nicekey = lambda x: re.sub('\(.*', '', x.lower().replace(':', '')).strip().replace(' ', '_').replace('_#_', '_')

    if jc.utils.has_data(data):

        for line in filter(None, data.splitlines()):
            if line.startswith('Wiphy'):
                if section:
                    if subsection_key and subsection:
                        section[subsection_key] = subsection
                        subsection_key = None
                        subsection = None

                    raw_output.append(section)
                    section = {}

                split_line = line.split()
                section['wiphy'] = split_line[1]

                continue

            if line.strip().startswith('Band '):
                if 'bands' not in section:
                    section['bands'] = []
                section['bands'].append({ 'band': line.strip().strip(':') })
                continue

            lists = [
                'Supported Ciphers',
                'Supported interface modes',
                'Supported commands',
                'software interface modes (can always be added)',
                'valid interface combinations',
                'HT Capability overrides',
                'Supported TX frame types',
                'Supported RX frame types',
                'Supported extended features',
            ]

            lists_bands = [
                'VHT Capabilities',
                'VHT RX MCS set',
                'VHT TX MCS set',
                'Bitrates (non-HT)',
                'Frequencies',
                'Capabilities'
            ]

            lists = lists + lists_bands

            if any(name in line for name in lists):
                if subsection and len(subsection):
                    if isinstance(subsection_key, list):
                        # append to last band
                        section[subsection_key[0]][-1][subsection_key[1]] = subsection
                    else:
                        section[subsection_key] = subsection

                    subsection_key = None
                    subsection = None

                subsection = []

                # Capabilities: 0x1ff
                split = line.split(': ')
                if len(split) == 2:
                    line = split[0]
                    subsection.append(split[1])


                if any(name in line for name in lists_bands):
                    subsection_key = ['bands', nicekey(line)]
                else:
                    subsection_key = nicekey(line)
                continue

            # subsection array, could use \t * x as index here
            #if line.strip().startswith('* ') and subsection_key:
            if subsection_key and len(line.strip()):
                subsection.append(line.strip().strip('* '))
                continue

            #         * #{ managed } <= 2048, #{ AP, mesh point } <= 8, #{ P2P-client, P2P-GO } <= 1,
            #           total <= 2048, #channels <= 1, STA/AP BI must match
            # match the `total`-line here
            if re.match(r"^\s{4,}", line) and subsection:
                subsection[len(subsection)-1] = subsection[len(subsection)-1] + ' ' + line.strip()
                continue

            if line.strip().startswith('Device supports '):
                if 'device_supports' not in section:
                    section['device_supports'] = []
                section['device_supports'].append(line.strip().replace('Device supports ', '').strip('.'))
                continue

            if re.match(r"^\s+.+", line):
                # ignore problematic lines
                #if 'Maximum RX AMPDU length' in line:
                #    continue

                split_line = line.split(':', maxsplit=1)
                if len(split_line) == 2:

                    if subsection and len(subsection):
                        if isinstance(subsection_key, list):
                            # append to last band
                            section[subsection_key[0]][-1][subsection_key[1]] = subsection
                        else:
                            section[subsection_key] = subsection

                        subsection_key = None
                        subsection = None

                    key = nicekey(split_line[0])

                    if split_line[1].find('(') < 0:
                        split_line[1] = split_line[1].replace(')', '')

                    section[key] = split_line[1].strip()

                continue

    if section:
        raw_output.append(section)

    return raw_output if raw else _process(raw_output)
