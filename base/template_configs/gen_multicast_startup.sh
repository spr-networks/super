#!/bin/bash

. ./configs/config.sh

cat << END
#!/bin/bash
/code/multicastproxy $LANIF,$VLANSIF
END
