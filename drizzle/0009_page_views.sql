CREATE TABLE "page_view_daily" (
	"day" text NOT NULL,
	"path" varchar(100) NOT NULL,
	"referrer" varchar(253) DEFAULT '' NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "page_view_daily_day_path_referrer_pk" PRIMARY KEY("day","path","referrer")
);
