package main

import "testing"

func TestGetGroupsJsonCache(t *testing.T) {
	dir := t.TempDir()
	savedPath := GroupsConfigFile
	GroupsConfigFile = dir + "/groups.json"
	t.Cleanup(func() {
		GroupsConfigFile = savedPath
		groupsCacheMtx.Lock()
		groupsCacheOK = false
		groupsCacheMtx.Unlock()
	})

	groupsCacheMtx.Lock()
	groupsCacheOK = false
	groupsCacheMtx.Unlock()

	saveGroupsJson([]GroupEntry{{Name: "lan"}})
	if g := getGroupsJson(); len(g) != 1 || g[0].Name != "lan" {
		t.Fatalf("first read: %+v", g)
	}

	// a save must invalidate so the next read reflects the change
	saveGroupsJson([]GroupEntry{{Name: "lan"}, {Name: "wan"}})
	if g := getGroupsJson(); len(g) != 2 {
		t.Fatalf("after save, expected 2 groups, got %d", len(g))
	}
}
