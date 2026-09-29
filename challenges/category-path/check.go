package main

func main() {
	leaf := func(n string) *Category { return &Category{Name: n} }
	tree := &Category{Name: "Каталог", Children: []*Category{
		{Name: "Одежда", Children: []*Category{leaf("Куртки"), {Name: "Обувь", Children: []*Category{leaf("Кеды")}}}},
		{Name: "Бытовая техника", Children: []*Category{
			leaf("Холодильники"),
			{Name: "Телевизоры", Children: []*Category{leaf("LCD"), leaf("OLED")}},
		}},
	}}
	check("deep match", func() (any, any) {
		return FindPath(tree, "OLED"), []string{"Каталог", "Бытовая техника", "Телевизоры", "OLED"}
	})
	check("no leftovers from dead branches", func() (any, any) {
		return FindPath(tree, "Холодильники"), []string{"Каталог", "Бытовая техника", "Холодильники"}
	})
	check("root itself", func() (any, any) { return FindPath(tree, "Каталог"), []string{"Каталог"} })
	check("not found gives nil", func() (any, any) { return FindPath(tree, "Ноутбуки"), []string(nil) })
	check("nil root gives nil", func() (any, any) { return FindPath(nil, "OLED"), []string(nil) })
	done()
}
