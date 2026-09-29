package main

func main() {
	sellers := map[int][]string{
		1: {"Moscow", "Omsk"},
		2: {"Moscow", "Kazan"},
		3: {"Omsk"},
		4: {"Tula", "Moscow", "Kazan"},
	}
	check("example", func() (any, any) {
		return FilterSellers(sellers, []string{"Moscow", "Kazan", "Tula"}),
			map[int][]string{1: {"Moscow"}, 2: {"Moscow", "Kazan"}, 4: {"Tula", "Moscow", "Kazan"}}
	})
	check("keeps only matching cities", func() (any, any) {
		return FilterSellers(sellers, []string{"Omsk"}), map[int][]string{1: {"Omsk"}, 3: {"Omsk"}}
	})
	check("no cities gives empty map", func() (any, any) {
		return FilterSellers(sellers, nil), map[int][]string{}
	})
	check("no sellers gives empty map", func() (any, any) {
		return FilterSellers(map[int][]string{}, []string{"Moscow"}), map[int][]string{}
	})
	done()
}
