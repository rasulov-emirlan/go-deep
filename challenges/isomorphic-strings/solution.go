package main

func Isomorphic(a, b string) bool {
	ra, rb := []rune(a), []rune(b)
	if len(ra) != len(rb) {
		return false
	}
	fwd := make(map[rune]rune)
	back := make(map[rune]rune)
	for i, x := range ra {
		y := rb[i]
		fx, seenX := fwd[x]
		by, seenY := back[y]
		if !seenX && !seenY {
			fwd[x], back[y] = y, x
			continue
		}
		if fx != y || by != x {
			return false
		}
	}
	return true
}
