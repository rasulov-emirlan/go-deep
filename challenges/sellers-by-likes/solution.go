package main

import (
	"cmp"
	"slices"
)

func SellersByLikes(names []string, likes []int) []string {
	if len(names) != len(likes) {
		return nil
	}
	idx := make([]int, len(names))
	for i := range idx {
		idx[i] = i
	}
	slices.SortFunc(idx, func(a, b int) int {
		return cmp.Or(cmp.Compare(likes[b], likes[a]), cmp.Compare(names[a], names[b]))
	})
	res := make([]string, len(idx))
	for i, id := range idx {
		res[i] = names[id]
	}
	return res
}
