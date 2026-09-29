package main

import "slices"

func Outsold(sales []int) []int {
	sorted := slices.Clone(sales)
	slices.Sort(sorted)
	res := make([]int, len(sales))
	for i, v := range sales {
		res[i], _ = slices.BinarySearch(sorted, v)
	}
	return res
}
