package main

import (
	"fmt"
	"math/rand/v2"
	"slices"
)

func checkSorted(in []int) (bool, string) {
	want := slices.Clone(in)
	slices.Sort(want)
	got := slices.Clone(in)
	SortInts(got)
	if slices.Equal(got, want) {
		return true, ""
	}
	if len(in) > 20 {
		return false, fmt.Sprintf("wrong order for %d elements", len(in))
	}
	return false, fmt.Sprintf("SortInts(%v) gave %v", in, got)
}

func main() {
	check("small", func() (any, any) {
		a := []int{5, 2, 9, 1, 5, 6}
		SortInts(a)
		return a, []int{1, 2, 5, 5, 6, 9}
	})
	ok("empty and single", func() (bool, string) {
		if pass, why := checkSorted(nil); !pass {
			return pass, why
		}
		return checkSorted([]int{42})
	})
	ok("negatives and duplicates", func() (bool, string) { return checkSorted([]int{3, -1, 3, 0, -1, -7, 3}) })
	ok("already sorted and reversed", func() (bool, string) {
		up := make([]int, 5000)
		down := make([]int, 5000)
		for i := range up {
			up[i], down[i] = i, len(up)-i
		}
		if pass, why := checkSorted(up); !pass {
			return pass, why
		}
		return checkSorted(down)
	})
	ok("200 random slices", func() (bool, string) {
		r := rand.New(rand.NewPCG(1, 2))
		for range 200 {
			a := make([]int, r.IntN(300))
			for i := range a {
				a[i] = r.IntN(100) - 50
			}
			if pass, why := checkSorted(a); !pass {
				return pass, why
			}
		}
		return true, ""
	})
	done()
}
