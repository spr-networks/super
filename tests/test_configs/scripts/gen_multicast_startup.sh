#!/bin/bash

. ./configs/base/config.sh

cat << END
#!/bin/bash
/code/multicastproxy $LANIF,$VLANSIF
END
