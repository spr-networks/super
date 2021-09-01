NAME=superbase
docker rm ${NAME}
docker run --name=${NAME} --platform=linux/arm --network=host --privileged --hostname=${NAME} -it ${NAME}
