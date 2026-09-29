package main

import (
	"fmt"
	"slices"
)

// checkFront reports whether items is the targets first, then a reordering of rest.
func checkFront(items []string, target string, n int, rest []string) (bool, string) {
	for i, it := range items {
		if (i < n) != (it == target) {
			return false, fmt.Sprintf("got %q", items)
		}
	}
	tail := slices.Clone(items[n:])
	slices.Sort(tail)
	rest = slices.Clone(rest)
	slices.Sort(rest)
	return slices.Equal(tail, rest), fmt.Sprintf("other items changed: got %q", items)
}

func main() {
	ok("example", func() (bool, string) {
		s := []string{"knife", "fork", "spoon", "fork", "cup", "knife"}
		MoveToFront(s, "fork")
		return checkFront(s, "fork", 2, []string{"knife", "spoon", "cup", "knife"})
	})
	ok("target at the end", func() (bool, string) {
		s := []string{"cup", "cup", "fork"}
		MoveToFront(s, "fork")
		return checkFront(s, "fork", 1, []string{"cup", "cup"})
	})
	ok("all targets", func() (bool, string) {
		s := []string{"fork", "fork"}
		MoveToFront(s, "fork")
		return checkFront(s, "fork", 2, nil)
	})
	ok("no targets", func() (bool, string) {
		s := []string{"cup", "knife"}
		MoveToFront(s, "fork")
		return checkFront(s, "fork", 0, []string{"cup", "knife"})
	})
	ok("empty does not panic", func() (bool, string) {
		MoveToFront(nil, "fork")
		return true, ""
	})
	done()
}
