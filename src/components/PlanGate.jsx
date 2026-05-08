import React from "react";
import { Link } from "react-router-dom";
import { Lock, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PlanGate({ requiredPlan = "pro", feature = "această funcție" }) {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="bg-card border border-primary/30 rounded-2xl p-10 text-center max-w-md mx-auto space-y-5 shadow-xl shadow-primary/5">
        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
          <Lock className="w-8 h-8 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-bold">Acces restricționat</h2>
          <p className="text-muted-foreground text-sm mt-2">
            <span className="font-semibold text-foreground">{feature}</span> este disponibilă doar pentru planul{" "}
            <span className="text-primary font-bold uppercase">{requiredPlan}</span> sau superior.
          </p>
        </div>
        <div className="bg-secondary/50 rounded-xl p-4 text-sm text-muted-foreground">
          Ești în prezent pe planul <span className="font-bold text-foreground">FREE</span>.
          Fă upgrade pentru a debloca toate funcțiile platformei.
        </div>
        <Link to="/Pricing">
          <Button className="w-full bg-primary hover:bg-primary/90 gap-2">
            <Crown className="w-4 h-4" />
            Fă Upgrade Acum
          </Button>
        </Link>
      </div>
    </div>
  );
}