package main

// SortInts is an in-place quicksort (Hoare partition, middle pivot).
// It recurses into the smaller half, so the stack stays O(log n).
func SortInts(a []int) {
	for len(a) > 1 {
		p := a[len(a)/2]
		i, j := 0, len(a)-1
		for i <= j {
			for a[i] < p {
				i++
			}
			for a[j] > p {
				j--
			}
			if i <= j {
				a[i], a[j] = a[j], a[i]
				i++
				j--
			}
		}
		if j+1 < len(a)-i {
			SortInts(a[:j+1])
			a = a[i:]
		} else {
			SortInts(a[i:])
			a = a[:j+1]
		}
	}
}
