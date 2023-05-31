#!/bin/bash

DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )

IMAGE=sta4
NAME=sta4
IFACE=wlan5
D_TEST=$DIR #super/tests
TEST_OUTPUT=test-output.log

GOT_IMAGE=$(docker images | grep "${IMAGE}")
if [ -z "$GOT_IMAGE" ]; then
        echo "- need to build image. run this:"
        echo "cd $IMAGE && ./build.sh"
        exit
fi

ID=$(docker run --network none \
	--privileged \
	-d \
	-v $D_TEST/code:/code \
	-w /code \
	--entrypoint=/go.sh \
	--name $NAME $IMAGE)

echo "~ ID= ${ID:0:12}"

move_iface_pid() {
  PID=$(docker inspect --format='{{.State.Pid}}' $2)
  PHY=phy$(iw $1 info | grep wiphy | awk '{print $2}')
  #echo move $1 is $PHY to $2 is $PID
  iw phy $PHY set netns $PID
}

move_iface_pid "$IFACE" "$NAME"

echo "~ waiting for $NAME to be done ..."
READY=0
for x in $(seq 0 9); do
	#STATUS=$(docker inspect $ID | jq -r .[0].State.Status)
	STATUS=$(docker inspect $ID | grep Status | cut -d '"' -f4)
	if [ "$STATUS" = "exited" ]; then
		READY=1
		break
	fi
	sleep 5
done

if [ $READY -eq 0 ]; then
	echo "- something wrong when running tests..."
	exit
fi

# grep test output logs for x failing
# TODO exit code from npm test for the container
docker logs $NAME > $TEST_OUTPUT

TEST_FAIL=$(grep -Eo '[0-9]+ failing' $TEST_OUTPUT)

if [ -z $TEST_FAIL ]; then
	echo "+ test run passed"
else
	echo "- test run failed! see $TEST_OUTPUT"
fi

docker rm $NAME 2>&1 >/dev/null
