# Σχετική βιβλιογραφία

*Συγκεντρώθηκε 18/11/2026, ανά κομμάτι της δουλειάς.*

**Τι ελέγχθηκε:**
- Για κάθε αναφορά επιβεβαιώθηκαν τίτλος, συγγραφείς, συνέδριο ή περιοδικό και έτος από τον εκδότη, το DBLP / researchr
  ή το arXiv.
- Το «τι κάνει» βγαίνει από την περίληψη. **Τα κείμενα δεν διαβάστηκαν ολόκληρα:** πριν παραθέσεις έναν αριθμό ή έναν
  ισχυρισμό τους στη διπλωματική, άνοιξε το paper.
- Όσα είναι μόνο στο arXiv (χωρίς κρίση από ομότιμους) σημειώνονται **[arXiv]**.

**Για την Παρασκευή, αν διαβάσεις μόνο λίγα:**
- [1] η επισκόπηση του AIOps·
- [15] το gray failure, που είναι τα δύο σφάλματά μας·
- [13] το MAPE-K, που είναι ο βρόχος μας·
- [6] το AIOpsLab, η πιο κοντινή δουλειά·
- [20] το Extended Isolation Forest, που στηρίζει το επιχείρημα για το IF·
- [29] open έναντι closed φορτίου.

---

## 1. AIOps: η περιοχή

**[1]** P. Notaro, J. Cardoso, M. Gerndt. *A Survey of AIOps Methods for Failure Management.* ACM Transactions on
Intelligent Systems and Technology 12(6), Article 81, 2021. [doi:10.1145/3483424](https://doi.org/10.1145/3483424)
- Οργανώνει τη βιβλιογραφία της διαχείρισης βλαβών σε 5 κατηγορίες και 14 υποκατηγορίες, ανάλογα με το πότε επεμβαίνει η
  μέθοδος και ποιο πρόβλημα λύνει.
- **Για εμάς:** ο ορισμός της περιοχής. Η δουλειά μας είναι ανίχνευση, διάγνωση και αποκατάσταση στον ίδιο βρόχο.

**[2]** L. Zhang, T. Jia, M. Jia, Y. Wu, A. Liu, Y. Yang, Z. Wu, X. Hu, P. S. Yu, Y. Li. *A Survey of AIOps for Failure
Management in the Era of Large Language Models.* arXiv:2406.11213, 2024 **[arXiv]**.
[arxiv.org/abs/2406.11213](https://arxiv.org/abs/2406.11213)
- Η ίδια περιοχή μετά τα LLM.
- Η επέκτασή της, *A Survey of AIOps in the Era of Large Language Models* (arXiv:2507.12472), σημειώνεται στο arXiv ως
  δεκτή στο ACM Computing Surveys.
- **Για εμάς:** πού στέκονται οι agents με LLM μέσα στο AIOps.

**[3]** J. Soldani, A. Brogi. *Anomaly Detection and Failure Root Cause Analysis in (Micro)Service-Based Cloud
Applications: A Survey.* ACM Computing Surveys 55(3), 1–39, 2022. [doi:10.1145/3501297](https://doi.org/10.1145/3501297)
- Ανίχνευση ανωμαλιών και ανάλυση αιτίας σε εφαρμογές cloud. Σημειώνει ότι οι δύο σπάνια δένονται σε μία ροή.
- **Για εμάς:** εμείς τις δένουμε. Το SVM ανιχνεύει, ο agent ερευνά και ενεργεί, και ο κώδικας επαληθεύει με το ίδιο SVM.

## 2. Agents με LLM για λειτουργίες cloud (η πιο κοντινή δουλειά)

**[4]** T. Ahmed, S. Ghosh, C. Bansal, T. Zimmermann, X. Zhang, S. Rajmohan. *Recommending Root-Cause and Mitigation
Steps for Cloud Incidents using Large Language Models.* ICSE 2023. [arxiv.org/abs/2301.03797](https://arxiv.org/abs/2301.03797)
- Η πρώτη μεγάλη μελέτη: GPT-3.x σε πάνω από 40.000 περιστατικά της Microsoft, zero-shot και fine-tuned, με αξιολόγηση
  από τους υπεύθυνους των περιστατικών.
- **Για εμάς:** το LLM εκεί προτείνει μόνο κείμενο. Δεν μαζεύει στοιχεία και δεν ενεργεί.

**[5]** Y. Chen, H. Xie, M. Ma, et al. *Automatic Root Cause Analysis via Large Language Models for Cloud Incidents*
(RCACopilot). EuroSys 2024. [doi:10.1145/3627703.3629553](https://doi.org/10.1145/3627703.3629553)
- Αντιστοιχίζει κάθε περιστατικό σε handler ανά τύπο alert και μαζεύει διαγνωστικά στοιχεία. Το LLM προβλέπει την
  κατηγορία της αιτίας και γράφει εξήγηση.
- Αξιολόγηση σε έναν χρόνο περιστατικών της Microsoft.
- **Για εμάς:** η συλλογή στοιχείων είναι εκεί προκαθορισμένη ανά τύπο alert. Σε εμάς τα εργαλεία τα διαλέγει ο agent,
  και ο agent ενεργεί.

**[6]** Y. Chen et al. *AIOpsLab: A Holistic Framework to Evaluate AI Agents for Enabling Autonomous Clouds.* MLSys 2025.
[arxiv.org/abs/2501.06706](https://arxiv.org/abs/2501.06706)
- Πλαίσιο αξιολόγησης: στήνει microservices (DeathStarBench [40]), εγχέει σφάλματα, παράγει φορτίο, εξάγει τηλεμετρία
  και δίνει στον agent διεπαφή.
- 48 προβλήματα, από ανίχνευση ως αντιμετώπιση.
- **Για εμάς:** η πιο κοντινή δουλειά. Και αυτοί κάνουν inject και αφήνουν τον agent να αντιμετωπίσει. Διαφορές:
  - εμείς συγκρίνουμε με τον μηχανισμό της παραγωγής (HPA), ζωντανά, σε σφάλματα όπου το scaling δεν βοηθά·
  - εκείνοι καλύπτουν πολύ περισσότερα είδη σφαλμάτων. Αυτό είναι δικό μας όριο.

**[7]** M. Shetty et al. *Building AI Agents for Autonomous Clouds: Challenges and Design Principles.* ACM SoCC 2024,
99–110. [arxiv.org/abs/2407.12165](https://arxiv.org/abs/2407.12165)
- Το όραμα του AIOpsLab («AgentOps»): απαιτήσεις για agents λειτουργιών, π.χ. αρθρωτός σχεδιασμός,
  αναπαραγωγιμότητα, έγχυση σφαλμάτων.
- **Για εμάς:** το πλαίσιο μέσα στο οποίο μπαίνει ο agent μας.

**[8]** D. Roy, X. Zhang, R. Bhave, C. Bansal, P. Las-Casas, R. Fonseca, S. Rajmohan. *Exploring LLM-based Agents for
Root Cause Analysis.* FSE 2024 Companion (industry), 208–219. [arxiv.org/abs/2403.04123](https://arxiv.org/abs/2403.04123)
- Ένας ReAct agent με εργαλεία, σε περιστατικά παραγωγής της Microsoft. Τα παλαιότερα LLM δεν μάζευαν μόνα τους logs και
  μετρικές. Ο agent είναι ανταγωνιστικός με ισχυρές baselines και πολύ πιο ακριβής στα γεγονότα.
- **Για εμάς:** το ίδιο επιχείρημα με την A34. Δύο εργαλεία παρατήρησης που διαλέγει ο agent, όχι έτοιμα στοιχεία στο
  prompt.

**[9]** Z. Wang, Z. Liu, Y. Zhang, A. Zhong, J. Wang, F. Yin, L. Fan, L. Wu, Q. Wen. *RCAgent: Cloud Root Cause
Analysis by Autonomous Agents with Tool-Augmented Large Language Models.* CIKM 2024.
[doi:10.1145/3627673.3680016](https://doi.org/10.1145/3627673.3680016)
- Agent με εργαλεία και τοπικό μοντέλο (για ιδιωτικότητα), σε χρήση στην πλατφόρμα Flink της Alibaba Cloud.
- **Για εμάς:** μια εναλλακτική στην εξάρτηση από πάροχο LLM, που είναι όριό μας (Γ6).

**[10]** S. Jha et al. *ITBench: Evaluating AI Agents across Diverse Real-World IT Automation Tasks.* ICML 2025, PMLR
267, 27134–27197. [arxiv.org/abs/2502.05352](https://arxiv.org/abs/2502.05352)
- Benchmark για SRE, ασφάλεια και FinOps. Οι agents λύνουν μικρό ποσοστό των σεναρίων SRE (13.8% στην πρώτη έκδοση
  arXiv).
- **Για εμάς:** τα γενικά προβλήματα SRE είναι ακόμα δύσκολα για τους agents. Εμείς στενεύουμε το πρόβλημα:
  - γεγονότα από κώδικα·
  - δύο κατηγορίες απόφασης·
  - επαλήθευση από κώδικα.

  Γι' αυτό και το ποσοστό μας είναι ψηλό. Αυτό να το λες έτσι.

**[11]** Z. Zhang, F. Yang, X. Qin, J. Zhang, Q. Lin, G. Cheng, D. Zhang, S. Rajmohan, Q. Zhang. *The Vision of
Autonomic Computing: Can LLMs Make It a Reality?* arXiv:2407.14402, 2024 **[arXiv]**.
[arxiv.org/abs/2407.14402](https://arxiv.org/abs/2407.14402)
- Agents με LLM για αυτόνομη διαχείριση microservices στο Kubernetes, σε εργασίες αυξανόμενης δυσκολίας. Η επιτυχία πέφτει
  όσο δυσκολεύουν.
- **Για εμάς:** ο πιο άμεσος συνδυασμός «LLM + Kubernetes + autonomic».

**[12]** F. Yu et al. *Enabling Autonomic Microservice Management through Self-Learning Agents* (ServiceOdyssey).
arXiv:2501.19056, 2025 **[arXiv]**. [arxiv.org/abs/2501.19056](https://arxiv.org/abs/2501.19056)
- Agent που μαθαίνει το περιβάλλον μόνος του (curriculum, βιβλιοθήκη δεξιοτήτων), στο Sock Shop.
- **Για εμάς:** αντίθετη επιλογή από τη δική μας. Εμείς δίνουμε στον agent μετρημένη χωρητικότητα και μοντέλο υγείας,
  αντί να τα ανακαλύπτει.

## 3. Ο βρόχος: autonomic computing και self-adaptive συστήματα

**[13]** J. O. Kephart, D. M. Chess. *The Vision of Autonomic Computing.* IEEE Computer 36(1), 41–50, 2003.
[researchr](https://researchr.org/publication/KephartC03)
- Συστήματα που διαχειρίζονται τον εαυτό τους από στόχους υψηλού επιπέδου. Ο βρόχος MAPE-K: Monitor, Analyze, Plan,
  Execute πάνω σε Knowledge.
- **Για εμάς:** ο βρόχος μας είναι ένας MAPE-K:
  - **M** = ο detector·
  - **A** = το SVM και η ταξινόμηση του LLM·
  - **P** = η απόφαση του LLM·
  - **E** = τα εργαλεία με τα όρια·
  - **K** = ο πίνακας χωρητικότητας, το μοντέλο και η μνήμη.

  Και οι NFR είναι οι «στόχοι υψηλού επιπέδου».

**[14]** J. Li, M. Zhang, N. Li, D. Weyns, Z. Jin, K. Tei. *Exploring the Potential of Large Language Models in
Self-adaptive Systems.* SEAMS 2024 (short paper). [arxiv.org/abs/2401.07534](https://arxiv.org/abs/2401.07534)
- Επισκόπηση: τα LLM μπορούν να μπουν σε κάθε φάση του MAPE-K.
- **Για εμάς:** εμείς βάζουμε το LLM μόνο στις φάσεις A και P. Τα M, E και η επαλήθευση μένουν σε κώδικα. Αυτή είναι
  σχεδιαστική επιλογή, και η πηγή αυτή τη στηρίζει.

## 4. Τα σφάλματα: gray failure και chaos engineering

**[15]** P. Huang et al. *Gray Failure: The Achilles' Heel of Cloud-Scale Systems.* HotOS 2017.
[doi:10.1145/3102980.3103005](https://doi.org/10.1145/3102980.3103005)
- Τα μεγάλα incidents του cloud προέρχονται συνήθως από ύπουλα σφάλματα, όχι από fail-stop. Βασική ιδέα η **διαφορική
  παρατηρησιμότητα:** οι ανιχνευτές του συστήματος δεν βλέπουν αυτό που βλέπουν οι χρήστες.
- **Για εμάς:** αυτό ακριβώς είναι το stuck και το cpuhog:
  - το liveness περνά (Α1)·
  - η CPU του HPA λέει «αδρανές» ή «χρειάζεται pods» (Β5)·
  - οι χρήστες βλέπουν 100% σφάλματα ή p95 0.72 s.

  Γι' αυτό μετράμε τις NFR στο ingress, όπως τις βλέπει ο χρήστης (Γ1). Προτείνουν επίσης παρακολούθηση σε πολλές
  διαστάσεις αντί για heartbeat, όπως το δικό μας SVM.

**[16]** A. Basiri, N. Behnam, R. de Rooij, L. Hochstein, L. Kosewski, J. Reynolds, C. Rosenthal. *Chaos Engineering.*
IEEE Software 33(3), 35–41, 2016. [doi:10.1109/MS.2016.60](https://doi.org/10.1109/MS.2016.60)
- Πειράματα με επίτηδες βλάβες για να ελεγχθεί η αξιοπιστία (Netflix).
- **Για εμάς:** το `inject.sh` και τα σενάρια στο λεπτό 4. Το ότι η έγχυση δεν αφήνει ίχνος στα logs (A34) είναι η
  ίδια λογική: δοκιμάζεις το σύστημα, όχι τον ανιχνευτή της έγχυσης.

## 5. Ανίχνευση ανωμαλιών: One-Class SVM έναντι Isolation Forest

**[17]** B. Schölkopf, J. C. Platt, J. Shawe-Taylor, A. J. Smola, R. C. Williamson. *Estimating the Support of a
High-Dimensional Distribution.* Neural Computation 13(7), 1443–1471, 2001.
[doi:10.1162/089976601750264965](https://doi.org/10.1162/089976601750264965)
- Ο One-Class SVM. Μια συνάρτηση θετική μέσα στην περιοχή που κρατά τα περισσότερα δεδομένα και αρνητική έξω, από ένα
  ανάπτυγμα kernel πάνω σε λίγα σημεία (support vectors).
- Το ν φράσσει το ποσοστό των εκπαιδευτικών σημείων έξω από την περιοχή.
- **Για εμάς:** το μοντέλο μας (ν 0.02, RBF, γ 0.1). Το score μας είναι η ίδια απόφαση διαβασμένη ως απόσταση: ο
  λογάριθμος του αθροίσματος του kernel.

**[18]** D. M. J. Tax, R. P. W. Duin. *Support Vector Data Description.* Machine Learning 54(1), 45–66, 2004.
[doi:10.1023/B:MACH.0000008084.60811.49](https://doi.org/10.1023/B:MACH.0000008084.60811.49)
- Η ίδια ιδέα ως «σφαίρα γύρω από τα δεδομένα». Με kernel RBF γίνεται πιο ευέλικτη.
- **Για εμάς:** η δεύτερη κλασική αναφορά στην ταξινόμηση μίας κλάσης (one-class classification). Χρήσιμη αν σε ρωτήσουν
  «γιατί όχι SVDD;».

**[19]** F. T. Liu, K. M. Ting, Z.-H. Zhou. *Isolation Forest.* ICDM 2008, 413–422.
[doi:10.1109/ICDM.2008.17](https://doi.org/10.1109/ICDM.2008.17). Και: *Isolation-Based Anomaly Detection.* ACM TKDD
6(1), Article 3, 2012. [doi:10.1145/2133360.2133363](https://doi.org/10.1145/2133360.2133363)
- Απομονώνει τις ανωμαλίες αντί να περιγράφει τα κανονικά. Κατά το TKDD «χωρίς κανένα μέτρο απόστασης ή πυκνότητας».
- **Για εμάς:** αυτή η φράση είναι η ρίζα του προβλήματος (Γ2). Το IF δεν μετρά πόσο μακριά είναι ένα σημείο, άρα πέρα
  από τα δεδομένα το score του μένει επίπεδο.

**[20]** S. Hariri, M. Carrasco Kind, R. J. Brunner. *Extended Isolation Forest.* IEEE TKDE 33(4), 1479–1489, 2021.
[doi:10.1109/TKDE.2019.2947676](https://doi.org/10.1109/TKDE.2019.2947676)
- Δείχνει ότι οι τομές παράλληλες στους άξονες αφήνουν τεχνουργήματα στο score του IF, και προτείνει τομές με τυχαία
  κλίση.
- **Για εμάς:** δημοσιευμένη στήριξη του «κόβει μία μετρική τη φορά, άρα δεν ξεχωρίζει συνδυασμούς» (1 pod στα 300 rps:
  +0.005). Το όριο min–max των τομών, που κάνει το score επίπεδο πέρα από τα δεδομένα, το δείχνουμε με δικές μας
  μετρήσεις, όχι από εδώ.

**[21]** V. Chandola, A. Banerjee, V. Kumar. *Anomaly Detection: A Survey.* ACM Computing Surveys 41(3), Article 15,
2009. [doi:10.1145/1541880.1541882](https://doi.org/10.1145/1541880.1541882)
- Η κλασική επισκόπηση. Ορίζει την ημι-εποπτευόμενη ανίχνευση: εκπαίδευση μόνο σε κανονικά δεδομένα.
- **Για εμάς:** αυτή είναι η δική μας περίπτωση (210 υγιείς μετρήσεις, καμία ετικέτα σφάλματος).

## 6. Autoscaling και το HPA

**[22]** T. Lorido-Botran, J. Miguel-Alonso, J. A. Lozano. *A Review of Auto-scaling Techniques for Elastic Applications
in Cloud Environments.* Journal of Grid Computing 12, 559–592, 2014.
[doi:10.1007/s10723-014-9314-7](https://doi.org/10.1007/s10723-014-9314-7)
- Πέντε κατηγορίες: κανόνες με κατώφλια, θεωρία ελέγχου, reinforcement learning, θεωρία ουρών, χρονοσειρές.
- **Για εμάς:** το HPA είναι κανόνας λόγου προς στόχο (κατηγορία 1). Ο agent μας δεν ανήκει σε καμία από τις πέντε. Γι'
  αυτό αξίζει η σύγκριση.

**[23]** C. Qu, R. N. Calheiros, R. Buyya. *Auto-Scaling Web Applications in Clouds: A Taxonomy and Survey.* ACM
Computing Surveys 51(4), Article 73, 2018. [arxiv.org/abs/1609.09224](https://arxiv.org/abs/1609.09224)
- Ταξινόμηση των autoscalers ανά πρόκληση.
- **Για εμάς:** η δεύτερη επισκόπηση για το autoscaling.

**[24]** H. Qiu, S. S. Banerjee, S. Jha, Z. T. Kalbarczyk, R. K. Iyer. *FIRM: An Intelligent Fine-grained Resource
Management Framework for SLO-Oriented Microservices.* OSDI 2020, 805–825.
[usenix.org](https://www.usenix.org/conference/osdi20/presentation/qiu)
- Βρίσκει ποιο microservice προκαλεί την παραβίαση SLO με **SVM** και τη διορθώνει με reinforcement learning.
- **Για εμάς:** η πιο κοντινή δουλειά «ML + SLO» πριν από τα LLM, και χρησιμοποιεί κι αυτή SVM. Διαφορά: ενεργεί μόνο
  σε πόρους, όχι restart.

**[25]** K. Rzadca et al. *Autopilot: Workload Autoscaling at Google.* EuroSys 2020, 16:1–16:16.
[doi:10.1145/3342195.3387524](https://doi.org/10.1145/3342195.3387524)
- Οριζόντιο και κάθετο autoscaling στην παραγωγή της Google.
- **Για εμάς:** πώς φαίνεται το autoscaling στη βιομηχανία. Το HPA είναι η ανοιχτή, απλή εκδοχή του.

**[26]** H. Qiu et al. *AWARE: Automate Workload Autoscaling with Reinforcement Learning in Production Cloud Systems.*
USENIX ATC 2023, 387–402. [usenix.org](https://www.usenix.org/conference/atc23/presentation/qiu-haoran)
- Reinforcement learning για autoscaling στην παραγωγή, με ασφαλή εξερεύνηση.
- **Για εμάς:** η εναλλακτική «μάθε την πολιτική». Εμείς δεν εκπαιδεύουμε πολιτική. Ο agent αποφασίζει από γεγονότα και
  στοιχεία.

**[27]** T.-T. Nguyen, Y.-J. Yeom, T. Kim, D.-H. Park, S. Kim. *Horizontal Pod Autoscaling in Kubernetes for Elastic
Container Orchestration.* Sensors 20(16), 4621, 2020. [doi:10.3390/s20164621](https://doi.org/10.3390/s20164621)
- Πειράματα με το HPA: μετρικές πόρων (CPU) έναντι custom μετρικών από το Prometheus.
- **Για εμάς:** στήριξη στη Β2. Το HPA με CPU είναι η συνηθισμένη ρύθμιση, και τα custom metrics τα αποκλείσαμε σκόπιμα.

**[28]** Kubernetes documentation:
- *Horizontal Pod Autoscaling*, [kubernetes.io](https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/):
  - ο λόγος τρέχουσα / επιθυμητή τιμή·
  - καμία ενέργεια αν ο λόγος είναι μέσα στην ανοχή του 0.1·
  - στη CPU τα pods που δεν έχουν γίνει ακόμα έτοιμα μπαίνουν στην άκρη (`--horizontal-pod-autoscaler-cpu-initialization-period`
    5 λεπτά, `--horizontal-pod-autoscaler-initial-readiness-delay` 30 s).
- *Liveness, Readiness, and Startup Probes*,
  [kubernetes.io](https://kubernetes.io/docs/concepts/configuration/liveness-readiness-startup-probes/): όταν αποτύχει το
  readiness, το pod βγαίνει από τα endpoints του Service· όταν αποτύχει το liveness, το container κάνει restart.
- **Για εμάς:** η πηγή για τη Β5 (τι κάνει το Kubernetes σε κάθε σφάλμα) και για το 58–62% / 60% του cpuhog.

## 7. Το φορτίο και οι NFR

**[29]** B. Schroeder, A. Wierman, M. Harchol-Balter. *Open Versus Closed: A Cautionary Tale.* NSDI 2006, 239–252.
[usenix.org](https://www.usenix.org/conference/nsdi-06/open-versus-closed-cautionary-tale)
- Για το ίδιο φορτίο, ο μέσος χρόνος απόκρισης σε ανοιχτό σύστημα μπορεί να είναι τάξεις μεγέθους πάνω από ό,τι σε
  κλειστό. Πολλά εργαλεία φορτίου είναι κλειστά χωρίς να το λένε.
- **Για εμάς:** η αιτιολόγηση του ανοιχτού μοντέλου (k6 arrival-rate, Β7). Στο κλειστό η υπερφόρτωση κρύβεται.

**[30]** J. Dean, L. A. Barroso. *The Tail at Scale.* Communications of the ACM 56, 74–80, 2013.
[research.google](https://research.google/pubs/pub40801/)
- Σε μεγάλα συστήματα οι σπάνιες καθυστερήσεις κυριαρχούν στην εμπειρία του χρήστη.
- **Για εμάς:** γιατί η NFR είναι στο p95 και όχι στον μέσο όρο.

**[31]** B. Beyer, C. Jones, J. Petoff, N. R. Murphy (eds.). *Site Reliability Engineering: How Google Runs Production
Systems.* O'Reilly, 2016. [research.google](https://research.google/pubs/site-reliability-engineering-how-google-runs-production-systems/)
(διαθέσιμο δωρεάν online)
- SLO και error budget. Στο κεφάλαιο για την παρακολούθηση, τα «τέσσερα χρυσά σήματα»: latency, traffic, errors,
  saturation.
- **Για εμάς:**
  - οι NFR είναι SLO·
  - τα τρία από τα τέσσερα σήματα είναι οι είσοδοι του SVM (latency, throughput, errors), με τα pods στη θέση του
    saturation·
  - η `nfr_violation_s` είναι στην ουσία ό,τι ξοδεύτηκε από το error budget.

## 8. Η υλοποίηση του agent: ReAct, CodeAct, μνήμη, ασφάλεια

**[32]** S. Yao, J. Zhao, D. Yu, N. Du, I. Shafran, K. Narasimhan, Y. Cao. *ReAct: Synergizing Reasoning and Acting in
Language Models.* ICLR 2023. [arxiv.org/abs/2210.03629](https://arxiv.org/abs/2210.03629)
- Το LLM εναλλάσσει σκέψη και ενέργεια (κλήσεις εργαλείων).
- **Για εμάς:** ο βρόχος του CodeAgent (μια γραμμή «Thoughts:» και ένα βήμα κώδικα ανά απάντηση, A33).

**[33]** X. Wang, Y. Chen, L. Yuan, Y. Zhang, Y. Li, H. Peng, H. Ji. *Executable Code Actions Elicit Better LLM Agents*
(CodeAct). ICML 2024, PMLR 235. [arxiv.org/abs/2402.01030](https://arxiv.org/abs/2402.01030)
- Οι ενέργειες ως εκτελέσιμος κώδικας Python, αντί για JSON. Ως 20% υψηλότερη επιτυχία σε 17 LLM.
- **Για εμάς:** η ιδέα πίσω από τον `CodeAgent` του smolagents [34]. Αν ρωτήσουν «γιατί κώδικας και όχι tool-calling
  JSON».

**[34]** A. Roucher, A. Villanova del Moral, T. Wolf, L. von Werra, E. Kaunismäki. *smolagents.* Hugging Face, 2025,
λογισμικό. [github.com/huggingface/smolagents](https://github.com/huggingface/smolagents)
- Η βιβλιοθήκη του agent μας. Πριν το βάλεις στη διπλωματική, πάρε το ακριβές BibTeX από το README του repo.

**[35]** A. Aamodt, E. Plaza. *Case-Based Reasoning: Foundational Issues, Methodological Variations, and System
Approaches.* AI Communications 7(1), 39–59, 1994. [doi:10.3233/AIC-1994-7104](https://doi.org/10.3233/AIC-1994-7104)
- Ο κύκλος του case-based reasoning: ανάκτηση, επαναχρησιμοποίηση, έλεγχος της λύσης, μάθηση.
- **Για εμάς:** η μνήμη είναι αυτός ο κύκλος:
  - ανάκτηση = τα top-2 επιλυμένα περιστατικά κάτω από 0.42·
  - επαναχρησιμοποίηση = μέσα στο prompt·
  - έλεγχος = η επαλήθευση·
  - μάθηση = αποθηκεύεται κάθε έκβαση.

**[36]** P. Lewis et al. *Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks.* NeurIPS 2020.
[arxiv.org/abs/2005.11401](https://arxiv.org/abs/2005.11401)
- Το LLM μαζί με ανάκτηση από εξωτερικό ευρετήριο.
- **Για εμάς:** η μνήμη στο ChromaDB είναι μια μορφή RAG. Η διαφορά: το embedding είναι το διάνυσμα του μοντέλου υγείας,
  όχι κείμενο.

**[37]** K. Greshake, S. Abdelnabi, S. Mishra, C. Endres, T. Holz, M. Fritz. *Not What You've Signed Up For: Compromising
Real-World LLM-Integrated Applications with Indirect Prompt Injection.* AISec 2023, 79–90.
[doi:10.1145/3605764.3623985](https://doi.org/10.1145/3605764.3623985)
- Οδηγίες κρυμμένες σε δεδομένα που διαβάζει αργότερα το LLM.
- **Για εμάς:** η Γ7α. Τα logs που διαβάζει ο agent περιέχουν κείμενο από χρήστες, και γι' αυτό τα εργαλεία έχουν
  σκληρά όρια.
- *Η σειρά των συγγραφέων διαφέρει ανάμεσα στις πηγές. Έλεγξέ την στα πρακτικά.*

## 9. Μεθοδολογία: μη ντετερμινισμός και στατιστική

**[38]** S. Ouyang, J. M. Zhang, M. Harman, M. Wang. *An Empirical Study of the Non-determinism of ChatGPT in Code
Generation.* arXiv:2308.02828 (ο τίτλος της πρώτης έκδοσης: *LLM is Like a Box of Chocolates…*). Κατά το PDF των
συγγραφέων στο ACM TOSEM 2024: δεν επιβεβαιώθηκε στον εκδότη. [arxiv.org/abs/2308.02828](https://arxiv.org/abs/2308.02828)
- Ακόμα και με temperature 0 οι απαντήσεις δεν είναι ντετερμινιστικές.
- **Για εμάς:** η Β3. Γι' αυτό μετράμε σε επαναλήψεις και κρίνουμε την επιτυχία με κώδικα, όχι από το κείμενο του LLM.
  Παράδειγμα: τα δύο runs της 18/11 με τα ίδια γεγονότα πήραν διαφορετικό δρόμο.

**[39]** A. Arcuri, L. Briand. *A Practical Guide for Using Statistical Tests to Assess Randomized Algorithms in Software
Engineering.* ICSE 2011, 1–10. [doi:10.1145/1985793.1985795](https://doi.org/10.1145/1985793.1985795). Επέκταση:
*A Hitchhiker's Guide…*, STVR 2014.
- Πώς συγκρίνεις στοχαστικούς αλγορίθμους: μη παραμετρικά τεστ, μέγεθος επίδρασης, όχι μόνο p.
- **Για εμάς:** η Β1 (n = 4). Τεστ μετάθεσης για το κόστος, Fisher για τα σφάλματα, και τα ποσοστά ανάκαμψης δίπλα στο p.

## 10. Εφαρμογές για πειράματα (για τα όρια)

**[40]** Y. Gan et al. *An Open-Source Benchmark Suite for Microservices and Their Hardware-Software Implications for
Cloud & Edge Systems* (DeathStarBench). ASPLOS 2019.
[doi:10.1145/3297858.3304013](https://doi.org/10.1145/3297858.3304013)
- Η συνηθισμένη εφαρμογή microservices στα πειράματα (social network, media, hotel). Τη χρησιμοποιεί και το AIOpsLab
  [6].
- **Για εμάς:** απειλή για την εγκυρότητα. Εμείς έχουμε **μία** υπηρεσία (το backend του myWorld Travel), όχι γράφο
  microservices. Ο agent δεν χρειάζεται να εντοπίσει *ποια* υπηρεσία φταίει.

---

## Πού στεκόμαστε (μια παράγραφος για τη διπλωματική)

Οι περισσότερες δουλειές με LLM στις λειτουργίες cloud σταματούν στη διάγνωση [4, 5, 8, 9], ή αξιολογούν agents σε
benchmarks [6, 10]. Λίγες κλείνουν τον βρόχο ως την ενέργεια και την επαλήθευσή της [6, 11].

Η δική μας δουλειά είναι ένας μικρός MAPE-K βρόχος [13] όπου:
1. **η ανίχνευση και η επαλήθευση** γίνονται με ένα μοντέλο μίας κλάσης [17] στις μονάδες των NFR. Το μοντέλο έχει τα pods
   ως είσοδο και μετρά απόσταση, κάτι που το Isolation Forest δεν κάνει [19, 20]·
2. **το LLM** ταξινομεί, ερευνά με εργαλεία [8, 32, 33] και ενεργεί με σκληρά όρια·
3. **ο κώδικας** κρίνει την επιτυχία με το ίδιο μοντέλο και μετρημένο θόρυβο.

Η σύγκριση γίνεται ζωντανά με τον μηχανισμό της παραγωγής (HPA [27, 28]), με ανοιχτό φορτίο [29], και σε gray failures
[15] όπου το scaling δεν βοηθά.

Τα όρια σε σχέση με τη βιβλιογραφία:
- μία υπηρεσία αντί για γράφο microservices [40]·
- δύο είδη σφαλμάτων αντί για δεκάδες [6, 10]·
- n = 4 ανά σενάριο [39]·
- εξάρτηση από πάροχο LLM [9].
