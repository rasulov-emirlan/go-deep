package main

func FilterSellers(sellers map[int][]string, cities []string) map[int][]string {
	want := make(map[string]struct{}, len(cities))
	for _, c := range cities {
		want[c] = struct{}{}
	}
	res := make(map[int][]string)
	for id, list := range sellers {
		var hit []string
		for _, c := range list {
			if _, found := want[c]; found {
				hit = append(hit, c)
			}
		}
		if len(hit) > 0 {
			res[id] = hit
		}
	}
	return res
}
