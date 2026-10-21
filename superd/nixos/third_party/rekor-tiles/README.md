# rekor-tiles, trimmed

The packages of github.com/sigstore/rekor-tiles/v2 v2.3.0 that sigstore-go
links into superd, unmodified, without the gRPC service stubs
(pkg/generated/protobuf/rekor_service_grpc.pb.go and rekor_service.pb.gw.go):
superd only verifies Rekor entries, so it doesn't need google.golang.org/grpc.
go.mod replaces the module with this directory.

To update: copy the same packages' non-test .go files from the new release
over these, again leaving out those two files, then `go mod tidy`.
