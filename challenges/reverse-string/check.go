package main

func main() {
	check("ascii", func() (any, any) { return Reverse("Magnit"), "tingaM" })
	check("cyrillic", func() (any, any) { return Reverse("Привет"), "тевирП" })
	check("emoji and accents", func() (any, any) { return Reverse("héllo 😀"), "😀 olléh" })
	check("single rune", func() (any, any) { return Reverse("ж"), "ж" })
	check("empty", func() (any, any) { return Reverse(""), "" })
	done()
}
