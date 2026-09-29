package main

func CanBuildString(source, target string) bool {
	if len(target) > len(source) {
		return false
	}
	count := make(map[rune]int)
	for _, r := range source {
		count[r]++
	}
	for _, r := range target {
		count[r]--
		if count[r] < 0 {
			return false
		}
	}
	return true
}
